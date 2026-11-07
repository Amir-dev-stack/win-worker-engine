# WIN prediction-result correction workflow — design proposal

Status: design only. No correction endpoint is enabled and no existing result or claim can be edited through this proposal. This design must be reviewed and implemented with isolated contract tests before any correction is accepted.

## Problem

`POST /api/results` now creates an immutable first-writer claim for each prediction. A later submission with a different outcome correctly receives HTTP 409. The current `/api/independent-review` endpoint reviews lessons and coupon settlements; it does not review prediction-result claims. Reusing it without a dedicated case type would risk applying the wrong settlement semantics.

## Required invariants

1. The original submission and its claim remain immutable forever.
2. A correction is an additional, append-only, independently reviewed record; it never deletes or rewrites the original evidence.
3. The submitter credential and reviewer credential must differ. Credential separation is not proof of real-world identity; the owner must share the reviewer credential only with a different trusted person.
4. Approval requires a documented reason, event identity, market/period/line settlement rule, and independent HTTPS evidence. At least one evidence host must differ from the original submitter evidence host.
5. Rejection preserves the original effective outcome.
6. A correction must be idempotent under retries, reject conflicting operation payloads, and expose recoverable partial completion.
7. User-submitted and independently reviewed results are not automatically trusted ML labels. Dataset inclusion still requires source licence, provenance, point-in-time availability and separate model-owner approval.
8. No correction action may enable production prediction, model fitting, production promotion or automated betting.

## Proposed flow

1. **Request:** authenticated submitter opens a correction case referencing the prediction ID and original claim hash. The request supplies proposed outcome, reason, source URL and evidence URLs. It does not mutate the original result.
2. **Queue:** WIN stores an immutable correction-case record with state `pending_independent_review`, original claim hash, proposed payload hash and submitter credential ID. Duplicate identical requests return the existing case; a different payload conflicts.
3. **Review:** the existing separate reviewer credential authenticates, but the implementation must add a distinct `prediction_result_correction` case type and dedicated queue presentation. Reviewer confirms prediction/event identity, settlement period/rules, proposed outcome and independent evidence. Reviewer cannot be the submitter credential.
4. **Operation claim:** use the existing review-operation pattern: deterministic operation ID, canonical fingerprint, `putIfNew`, ETag lease renewal with `putIfMatch`, and an idempotent completion response. The operation must bind reviewer identity, case type, case ID, decision, reason, evidence and all checks.
5. **Approval event:** persist an append-only correction approval event referencing the original claim hash, original result ID, previous effective version, proposed corrected payload hash, reviewer credential, review time, reason and evidence. Never overwrite the original claim.
6. **Effective projection:** expose the approved correction as a new version. The projection must use a conditional update and a monotonic version/parent hash so concurrent approvals cannot silently overwrite each other. Every consumer that reads effective settlement must use one shared resolver; consumers that have not migrated must continue to treat the original result as unresolved rather than silently assuming the corrected outcome.
7. **Recovery:** if the approval event is saved but the effective projection or learning projection fails, the exact same review submission repairs it after lease expiry. The reviewer queue exposes recovery state and does not invite a different correction payload.
8. **Audit:** preserve original and corrected versions, rejected requests, operation records and history. No delete/edit route is permitted.

## Storage and implementation choices to validate

- Decide whether the immutable correction event is keyed by a stable correction ID or by a deterministic hash of prediction ID plus case ID. Avoid caller-controlled path fragments.
- Define a canonical schema/version for original and corrected settlement payloads.
- Confirm provider-side conditional-write behavior with the pinned `@netlify/blobs@11.1.7` in an explicitly approved non-production environment before relying on multi-writer correctness.
- Prefer a single effective-head record updated by ETag compare-and-swap, but only after proving every result consumer uses the resolver. Do not rely on a multi-key write being transactional.
- Do not automatically rewrite historical lessons, agent observations or model datasets. Emit a supersession event; each downstream consumer must explicitly resolve the latest approved version and preserve lineage.
- Decide how corrections to partially settled multi-leg coupons map to a prediction-level result. Do not infer a single prediction outcome from individual leg changes without a defined aggregation contract.

## Required isolated tests before implementation is considered complete

- unauthorized and owner-submitter credentials cannot approve a correction;
- same submitter cannot review their own case;
- missing/invalid evidence, same-domain-only evidence and missing reason fail closed;
- exact retry returns the same case and review operation;
- conflicting case payload returns 409;
- two reviewers cannot approve conflicting corrections for the same current version;
- stale ETag/version update loses without overwriting the current head;
- rejection leaves the original result effective;
- crash after immutable approval event but before effective projection is recoverable;
- crash during downstream learning projection is recoverable without duplicate records;
- all historical versions and original claim hashes remain verifiable;
- unreviewed or rejected correction never enters model training data.

## Explicit non-goals

No automatic corrections, no inferred result from score-only data, no bookmaker account integration, no automated betting, no production activation, no silent overwrite, and no retroactive ML label promotion.
