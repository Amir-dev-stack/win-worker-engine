# WIN ML data contracts — implementation note

Date: 2026-11-05  
Status: isolated contract foundation on the Stage 1 development branch; no production data was read or changed.

## What was added

- Versioned win.ml.dataset.v1 manifest with source/provider, competition/season, HTTPS source, licence, attribution, permitted-use, row-grain, event-time precision, retrieval time, row counts, schema version and SHA-256 content identity.
- A separate readiness gate: discoverable or importable data is not automatically training-approved. Research-only, benchmark-only, blocked, unapproved, date-only and unlabeled datasets cannot enter point-in-time training.
- A training-example contract with dataset/source/event identity, event start, prediction cutoff, feature-level availability timestamps and source IDs, plus market-specific settlement rule and settlement time.
- Leakage checks reject a feature published after the prediction cutoff, a cutoff at/after kickoff, a label settled before kickoff, and incompatible 1X2 vs total-goals outcomes.

## Deliberate boundaries

- This is a pure validation layer. It does not fetch, import, mutate, train, or write production datasets.
- Synthetic fixtures test the contract only; they are not sports evidence.
- automationAllowed is distinct from approvedForTraining: manual research imports may be allowed without automatic ingestion, but training still requires explicit training approval and a licence use of training.
- contentSha256 is supplied by the importer and validated as a digest shape; the importer must compute the hash over canonical raw bytes before the manifest can be trusted.
- The contract does not claim that a valid manifest is legal advice or that a dataset is representative.
- Real training remains blocked until an owner-approved, rights-cleared historical sample and reproducible importer are available.

## Next gate

Implement an isolated manifest registry and dataset inventory report that can run against synthetic fixtures first. Then connect only approved importers. No hosted Python runtime or paid data provider is required for this stage.
