# WIN ML data contracts — implementation note

Date: 2026-11-05  
Status: isolated contract foundation on the Stage 1 development branch; no production data was read or changed.

## What was added

- Versioned win.ml.dataset.v1 manifest with source/provider, competition/season, HTTPS source, licence, attribution, permitted-use, row-grain, event-time precision, retrieval time, row counts, schema version and SHA-256 content identity.
- A separate readiness gate: discoverable or importable data is not automatically training-approved. Research-only, benchmark-only, blocked, unapproved, date-only and unlabeled datasets cannot enter point-in-time training.
- **Additional fail-closed boundary (2026-11-06):** `approvedForTraining: true` and `permittedUse: "training"` inside a caller-supplied manifest are not trusted owner authorization. Until a separate authenticated and auditable owner-approval verifier exists, readiness always returns `trusted_owner_approval_evidence_missing`; training and model-review eligibility remain blocked. This intentionally prevents a caller from self-authorizing by editing manifest booleans.
- A training-example contract with dataset/source/event identity, event start, prediction cutoff, feature-level availability timestamps and source IDs, plus market-specific settlement rule and settlement time.
- Leakage checks reject a feature published after the prediction cutoff, a cutoff at/after kickoff, a label settled before kickoff, and incompatible 1X2 vs total-goals outcomes.
- An immutable dataset-manifest registry stores provenance metadata under `library/ml-dataset-manifests`, uses atomic create-if-absent writes, permits exact idempotent re-registration, and rejects attempts to replace an existing dataset identity with different metadata.
- A bounded inventory read returns manifest metadata only; it does not retrieve raw match or event payloads.

## Deliberate boundaries

- The validation functions are pure. The registry persists manifest metadata only when explicitly called; it does not fetch source data, train models, or promote artifacts. The offline football-results importer accepts caller-supplied bytes only; it performs no network request or persistent write. The new registry test uses the isolated test store and does not touch production Blobs.
- Synthetic fixtures test the contract only; they are not sports evidence.
- automationAllowed is distinct from approvedForTraining: manual research imports may be allowed without automatic ingestion. Neither manifest boolean is authoritative owner identity proof. Training also requires licence permission and a future separately authenticated, auditable approval record; that verifier is not yet implemented, so training remains blocked.
- contentSha256 is supplied by the importer and validated as a digest shape; the importer must compute the hash over canonical raw bytes before the manifest can be trusted.
- The contract does not claim that a valid manifest is legal advice or that a dataset is representative.
- Real training remains blocked until an owner-approved, rights-cleared historical sample and reproducible importer are available.

## Offline football-results importer\n\n- `netlify/lib/ml-football-importer.mts` accepts a caller-supplied UTF-8 JSON byte payload using the normalized `win.football.results.v2` schema. It computes SHA-256 over the exact supplied bytes, validates finished-match rows, exact kickoff timestamps, non-negative integer scores, unique event/record IDs and source provenance, then returns chronologically sorted normalized match rows plus a manifest.\n- The importer is deliberately offline and does not download data or build training examples. The research-import workflow calls it and registers only the resulting manifest; normalized rows and raw bytes are returned to the caller but are not persisted. The manifest hard-codes `automationAllowed: false`, `approvedForTraining: false` and `permittedUse: research_only`, regardless of source metadata. A separate owner/licence review is required before any training use. Isolated tests verify idempotent registration, conflict rejection and that only the manifest collection is written.\n- Synthetic tests cover byte hashing, row ordering, malformed payloads, duplicate IDs, invalid scores/timestamps, unfinished matches, HTTPS provenance and required attribution. These tests are added but are not claimed to have run until CI or a local test execution reports results.\n\n## Next gate

Next: add a reproducible, rights-cleared importer with canonical raw-byte hashing and row-level validation, initially against an owner-approved sample. Keep training disabled until source permissions and the dataset's training approval are independently verified. No hosted Python runtime or paid data provider is required for the registry stage.


## Point-in-time football examples and experiment plans

- `netlify/lib/ml-football-training-builder.mts` creates candidate full-time 1X2 training examples from completed match rows. Each target requires an explicit event-specific prediction cutoff and source-recorded settlement availability. The existing validator checks feature provenance, cutoff ordering and settlement semantics.
- Candidate creation is distinct from training permission: research-only candidates may be prepared and audited, but `readyForTraining` remains false until the manifest passes the independent owner/licence readiness gate.
- `netlify/lib/ml-football-experiment-plans.mts` defines reproducible experiment configurations for 1X2 multinomial Logistic Regression and total-goals Poisson attack/defence. Both use chronological 70/15/15 splits, fixed seeds, explicit optimization settings and minimum sample counts. The stable splitter keeps equal kickoff timestamps in a single partition and records exact event IDs.
- Preflight rejects unapproved or incompatible datasets, requires the actual chronological training/validation/test partition counts, checks each partition against its own minimum, and verifies that partition totals match the candidate count. A sufficient overall row count cannot mask an undersized holdout partition. Fitting is explicitly disabled in both plans. No model training, external runtime, paid provider or production operation is performed.
- Synthetic tests cover candidate labeling, cutoff/settlement requirements, research-only blocking, fixed seeds, sample-size preflight and chronological split integrity. They are not evidence of model performance.


## Training candidate and split integrity

The football candidate builder rejects duplicate event IDs and source-record IDs across the supplied evidence set before creating examples. Explicit target-event selection lets non-target rows remain historical feature evidence without being emitted as labels.

Chronological splitting groups equal kickoff instants and chooses two group boundaries nearest the requested 70/15/15 row proportions. It requires at least three distinct kickoff groups and never splits a simultaneous kickoff group across partitions. The resulting split is auditable by exact event IDs and boundary timestamps; actual sample-size requirements remain enforced separately by experiment preflight.


The chronological splitter validates timezone-qualified ISO timestamps before sorting. The split-aware preflight must receive the three realized partition counts; omitting them is a blocking condition. This prevents a large total candidate count from being treated as evidence that every holdout partition is adequately sized.


## Experiment-to-candidate compatibility gate

Experiment preflight now requires the realized candidate market and feature-schema version in addition to chronological partition counts. It rejects 1X2 labels supplied to the total-goals Poisson plan, total-goals labels supplied to the 1X2 Logistic Regression plan, and feature-schema mismatches. The current candidate builder emits only 1X2 examples; therefore the total-goals plan remains intentionally unusable until a separate, settlement-line-aware total-goals candidate builder exists. Both experiment plans continue to have fitting disabled.


## Football score-basis and 1X2 settlement boundary

The normalized football results importer now requires an explicit `scoreBasis: "regulation_time"` declaration. It rejects missing, ambiguous or extra-time-inclusive score semantics rather than assuming that a provider's generic final score matches a 90-minute 1X2 target. The point-in-time feature builder excludes rows that do not carry the regulation-time basis, and the target builder rejects such targets.

The 1X2 training label must use the fixed internal rule ID `win.football.regulation_time_1x2.v1`. This names WIN's score-based 90-minute regulation-time outcome convention; it is not a bookmaker-specific official settlement guarantee. The current normalized importer still requires the source adapter/operator to establish that the supplied score really represents regulation time. No authoritative bookmaker settlement-rule registry exists yet, and abandoned matches, void rules, extra-time-specific markets and bookmaker-specific exceptions are not modeled. Those cases must remain excluded until separately specified and verified.


## Result-availability provenance required for point-in-time training

The normalized football import schema now requires a source-recorded `resultAvailableAt` timestamp for every completed match. It must be timezone-qualified, at or after kickoff, and no later than the dataset retrieval timestamp. The importer preserves this value in each normalized row, allowing the point-in-time feature builder to include a historical result only after it was actually available.

This closes a wiring gap between the importer and feature builder: imported rows previously lacked the availability field required by the feature builder, so they could not safely flow directly into candidate generation. Rows without a trustworthy source-recorded availability instant are now rejected rather than assigning kickoff, retrieval time or an inferred timestamp. The timestamp still depends on the upstream source's accuracy and must be covered by source methodology review.


A synthetic end-to-end regression test now passes the v2 importer output directly into the point-in-time candidate builder. It checks that the source-recorded availability instant is preserved into feature provenance, the target result is labeled, and the imported research-only manifest still blocks training. This verifies interface compatibility only; it does not validate a real provider's timestamps or data rights.


## Owner-approval security boundary (2026-11-06)

The initial manifest design contains caller-supplied `approvedForTraining` and `permittedUse` fields. Those fields are useful provenance assertions but cannot establish that the caller is the dataset owner or an authorized WIN operator. Treating `approvedForTraining: true` as sufficient would allow a caller to self-authorize training. The readiness contract now fails closed with `trusted_owner_approval_evidence_missing`, even when both fields claim training approval. This is deliberate: do not remove the blocker until a separate approval workflow authenticates the owner, binds approval to the immutable dataset content hash and licence evidence, records who approved what and when, and supports revocation/audit. Research import and candidate construction remain available; model fitting and promotion remain disabled.


## Signed owner-approval evidence foundation (2026-11-06)

Added an isolated Ed25519 approval-evidence verifier. A signed approval payload binds a unique approval ID and reviewer identity to the exact dataset ID and immutable content SHA-256, the licence identifier and SHA-256 of reviewed licence evidence, the explicit training scope, and approval/expiry timestamps.

The verifier rejects missing trusted public keys, malformed signatures, altered payloads, mismatched dataset/hash/licence, future approvals and expired approvals. A separate signed revocation envelope is also validated against the original approval ID, dataset ID and content hash, with reviewer, reason and effective timestamp; future-dated revocations are rejected. The signing key must remain outside the repository; the verifier accepts a public key from trusted server configuration, never request data.

**This is not an active approval route.** It is a tested cryptographic building block only. Dataset readiness still unconditionally blocks training because the verifier is not connected to an authenticated owner-only approval/revocation registry. No approval key was configured, no approval was issued, and no training permission was granted. A subsequent stage must implement protected key configuration, append-only approval/revocation records, owner identity authentication, replay protection, revocation lookup and audit retrieval before readiness can consume evidence.


## Immutable owner approval and revocation registry foundation (2026-11-06)

Added a storage-backed internal registry using the existing WIN Blobs store; no new database or provider is introduced. Approval records are written with atomic `putIfNew` semantics under the approval ID. Repeated identical submissions are idempotent, while a conflicting reuse of an approval ID is rejected. Approval registration loads the immutable dataset manifest and verifies the signed payload against its dataset ID, content hash, licence ID, trusted public key and configured reviewer identity.

Revocation records are also immutable and keyed by the original approval ID, allowing at most one effective revocation record per approval. The read-only status function rechecks the signature, current dataset identity/hash/licence, expiry and any revocation before reporting `active`, `revoked`, `invalid` or `missing`. Revocation validation also requires its signed effective timestamp to be at or after the original approval timestamp, preventing a backdated revocation record from being accepted as chronologically valid.

**Security boundary remains incomplete by design:** these are internal library functions, not an HTTP route. No owner-authenticated UI/API, key provisioning, key rotation, or training-readiness integration has been added. A future route must source the public key and reviewer identity only from protected server configuration and authenticate the owner independently; request bodies must never supply either value. The dataset readiness gate continues to reject all training until that route, audit/revocation controls and explicit readiness integration are reviewed.


## Owner-authenticated approval control-plane endpoint (2026-11-06)

Added `POST /api/ml-owner-approval` with three actions: `approve`, `revoke` and read-only `status`. The endpoint requires a dedicated bearer token (minimum 32 characters), an Ed25519 public key and an exact configured reviewer ID, all sourced only from protected Netlify environment variables:

- `WIN_ML_OWNER_APPROVAL_TOKEN`
- `WIN_ML_OWNER_APPROVAL_PUBLIC_KEY`
- `WIN_ML_OWNER_REVIEWER_ID`

The endpoint does not accept any of those values from the request. It uses constant-time token comparison, requires JSON, caps the body at 64 KiB, disables response caching and fails with service-unavailable when configuration is absent. This is separate from the general `WIN_INTERNAL_TOKEN`; possessing the general internal token does not grant owner approval authority.

**Not activated:** no environment variables or private signing key have been configured by this work, no approval has been issued, and no real dataset was approved. Until the dedicated token, public key and reviewer identity are provisioned securely, the endpoint returns `503 owner_approval_control_plane_not_configured`. Training readiness remains independently fail-closed.
