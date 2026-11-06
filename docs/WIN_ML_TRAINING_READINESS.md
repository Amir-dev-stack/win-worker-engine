# WIN ML licence and training-readiness control plane

## Purpose

This control plane binds a dataset manifest to a signed licence review and a separate signed owner training approval. It is an evidence audit, not a legal opinion, trainer, model registry, or production authorization.

## Evidence chain

1. Register the immutable dataset manifest. The manifest's `permittedUse` and `approvedForTraining` fields are descriptive metadata only; they cannot grant authority.
2. Review the exact source licence document manually. Record its HTTPS source URL, SHA-256 of the reviewed document bytes, explicit `reviewedUse: "training"`, reviewer identity, rationale, review time and expiry.
3. Sign the canonical licence-review payload with the trusted Ed25519 reviewer key. Submit it to `POST /api/ml-owner-approval` with `action: "licence_evidence"`.
4. Create a separate signed owner approval that binds the dataset ID, exact dataset content hash, licence ID, and canonical licence-evidence hash. Submit with `action: "approve"`. The registry rejects an approval if the referenced licence evidence has not been registered and reverified.
5. Query `action: "readiness"` with the dataset ID and approval ID. The result rechecks dataset metadata, the licence signature and expiry, the owner approval signature and expiry, exact dataset/licence/hash binding, and revocation state.
6. Use `action: "status"` and `action: "list"` for audit inventory. Revocations are separately signed and immutable.

All requests require the dedicated owner bearer token. The trusted public key and reviewer ID come only from server-side configuration. Never send private keys, bearer tokens, or credentials in a request body, issue, commit, or chat.

## Readiness response semantics

- `evidenceReady: true` means only that the registered dataset, signed licence review and active owner approval form a currently valid evidence chain and the manifest passes basic metadata/time-grain checks.
- `evidenceReady: false` includes machine-readable reasons. Missing, expired, altered, mismatched, unauthorized, or revoked evidence blocks readiness.
- `modelFittingAllowed`, `productionPromotionAllowed`, and `automatedBettingAllowed` remain `false` unconditionally in this stage.

The synchronous dataset/training-example contract remains fail-closed. This audit does not unlock the trainer. A future training-execution integration must consume the composite readiness result at the actual fit boundary, independently verify the frozen dataset bytes and training run, and preserve human shadow review before any further promotion.

## Isolated 1X2 trainer foundation

WIN also contains a pure, deterministic multinomial logistic-regression implementation for football 1X2. It is not connected to a production route or automatic training job. Its inputs must include an event-specific prediction cutoff, feature availability timestamps and source IDs, and label-availability timestamps. It fits normalization parameters only on the training partition and rejects future features, unsettled labels, duplicate events, schema drift, overlapping training/validation chronology, non-finite values, and excessive compute requests.

The trainer emits a content-hashed artifact and validation metrics against a training-class-frequency baseline. Validation metrics are not held-out test evidence. A separate chronological test partition and the existing evaluation/promotion contract remain mandatory. The experiment plan still declares `fittingAllowed: false`; this implementation does not activate real-data fitting, production predictions, or betting.

## Cryptographic and legal limits

The Ed25519 signature proves that the configured reviewer signed the exact canonical attestation. It does not prove that the source document is authentic, complete, current, or legally interpreted correctly. A qualified human must inspect the source terms and determine whether the specific proposed training, storage, derivative-model, commercial, attribution, and automated-use activities are permitted. The source-document SHA-256 binds the attestation to the reviewed bytes; it is not a substitute for retaining and auditing those bytes under the applicable policy.

No source data is fetched by this control plane. It does not import real sports data, execute training, call an AI provider, spend money, promote a model, deploy production code, or place bets.
