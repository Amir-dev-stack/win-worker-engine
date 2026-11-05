# WIN ML data contracts — implementation note

Date: 2026-11-05  
Status: isolated contract foundation on the Stage 1 development branch; no production data was read or changed.

## What was added

- Versioned win.ml.dataset.v1 manifest with source/provider, competition/season, HTTPS source, licence, attribution, permitted-use, row-grain, event-time precision, retrieval time, row counts, schema version and SHA-256 content identity.
- A separate readiness gate: discoverable or importable data is not automatically training-approved. Research-only, benchmark-only, blocked, unapproved, date-only and unlabeled datasets cannot enter point-in-time training.
- A training-example contract with dataset/source/event identity, event start, prediction cutoff, feature-level availability timestamps and source IDs, plus market-specific settlement rule and settlement time.
- Leakage checks reject a feature published after the prediction cutoff, a cutoff at/after kickoff, a label settled before kickoff, and incompatible 1X2 vs total-goals outcomes.
- An immutable dataset-manifest registry stores provenance metadata under `library/ml-dataset-manifests`, uses atomic create-if-absent writes, permits exact idempotent re-registration, and rejects attempts to replace an existing dataset identity with different metadata.
- A bounded inventory read returns manifest metadata only; it does not retrieve raw match or event payloads.

## Deliberate boundaries

- The validation functions are pure. The registry persists manifest metadata only when explicitly called; it does not fetch or import raw data, train models, or promote artifacts. The new registry test uses the isolated test store and does not touch production Blobs.
- Synthetic fixtures test the contract only; they are not sports evidence.
- automationAllowed is distinct from approvedForTraining: manual research imports may be allowed without automatic ingestion, but training still requires explicit training approval and a licence use of training.
- contentSha256 is supplied by the importer and validated as a digest shape; the importer must compute the hash over canonical raw bytes before the manifest can be trusted.
- The contract does not claim that a valid manifest is legal advice or that a dataset is representative.
- Real training remains blocked until an owner-approved, rights-cleared historical sample and reproducible importer are available.

## Next gate

Next: add a reproducible, rights-cleared importer with canonical raw-byte hashing and row-level validation, initially against an owner-approved sample. Keep training disabled until source permissions and the dataset's training approval are independently verified. No hosted Python runtime or paid data provider is required for the registry stage.
