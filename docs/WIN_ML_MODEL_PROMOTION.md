# WIN ML model artifact and promotion gate

## Purpose

The ML data contract controls whether source data may be used for training. This second contract controls whether a trained model artifact has enough reproducible, out-of-sample evidence to be considered for a human-reviewed shadow evaluation.

It does not train a model, claim an edge, or promote a model into production.

## Required evidence

Each evaluation record binds:
- the exact dataset ID and SHA-256 content hash;
- model ID/version, algorithm, sport and market;
- feature schema version, unique feature names and target/settlement definition;
- feature-builder source commit, training-run ID, SHA-256 of the complete training configuration and SHA-256 of the exact chronological split manifest;
- immutable model artifact SHA-256 and source-code commit SHA;
- training, validation and test windows with strict chronological separation;
- the training fit-data cutoff, which must not extend beyond the training window;
- row counts for each split;
- baseline and model Brier score and log loss;
- expected calibration error.

## Default readiness thresholds

- 500 or more training rows;
- 100 or more validation rows;
- 100 or more test rows;
- at least 1% relative Brier-score improvement over the baseline on the held-out test period;
- test log loss no worse than baseline;
- expected calibration error no greater than 0.05;
- source dataset must independently pass the training-permission and exact-event-time gate.

Thresholds are configurable for research experiments, but a lower threshold does not create automatic production approval.

## Safety boundary

A passing evaluation is only `eligible_for_human_shadow_review`. The returned contract explicitly sets:
- `automaticPromotionAllowed: false`
- `productionPromotionAllowed: false`

A model still needs human review, independent shadow evaluation, ongoing calibration and drift monitoring, and a separate owner-approved production release. No synthetic test fixture is evidence of sports performance.

## Current status

This is a pure validation contract with synthetic tests. No model was trained, no production data was imported, and no artifact was promoted. The first real experiment should use one sport/market, a rights-cleared owner-approved dataset, a reproducible feature builder, and a chronological held-out test.


## Additional evaluation consistency checks

The evaluator rejects a sport mismatch between the dataset and evaluation, incompatible market/algorithm pairs (1X2 with Logistic Regression or CatBoost; total goals with Poisson attack/defence or CatBoost), and target definitions that do not identify the declared market. These checks complement the existing exact dataset hash, chronological windows and training fit-data cutoff checks.

The artifact's recorded training timestamp may be later than the historical test window in a retrospective offline evaluation. This is not, by itself, leakage: the relevant safeguard is that the fit-data cutoff remains within the training window and the validation/test windows remain chronologically held out. The evaluation record does not prove that these claims are truthful; reproducible training logs and independent review are still required.


## Reproducibility and prediction-origin boundary

The evaluation record now requires:
- `trainingRunId` to identify one immutable training execution;
- `trainingConfigSha256` to bind the complete algorithm/hyperparameter/seed configuration;
- `splitManifestSha256` to bind the exact chronological partition membership;
- `featureBuilderCommitSha` to identify the feature-generation code independently of the training/evaluation source commit.

These are provenance requirements, not a substitute for retained training logs, source data and deterministic execution. The caller must compute the hashes from canonical serialized inputs; a syntactically valid hash alone does not prove that the underlying files are available or truthful.

`win.ml.prediction.v1` is a separate 1X2 prediction envelope. It requires the origin `trained_model`, links model/version/artifact, dataset/hash and feature schema back to an evaluation that passes the human shadow-review gate, records a hash of the exact feature vector, and checks that the prediction cutoff and generation time precede kickoff. It validates a normalized HOME/DRAW/AWAY probability vector.

The only permitted use is `shadow_only`. Production use and automated betting are always false. LLM worker reports remain text research outputs and market-consensus calibration remains a benchmark; neither is a trained-model prediction. This contract validates the declared provenance envelope but cannot prove that a model binary actually executed. An inference runtime must compute and retain the feature-vector hash and execution log before emitting the envelope.

Current implementation still has no real trainer, model artifact registry, authoritative settlement-rule registry or inference runtime. The existing football candidate builder accepts a caller-supplied settlement-rule ID string; it does not independently resolve or verify that rule against an official source. Therefore candidate labels remain research artifacts until settlement semantics and source provenance are independently verified.


## Canonical provenance hashing

`netlify/lib/ml-provenance.mts` provides deterministic JSON canonicalization and SHA-256 helpers for training configurations, chronological split manifests and inference feature vectors. Object keys are sorted, array order is retained, and undefined, non-finite, cyclic or non-plain-object values are rejected. This prevents semantically identical objects with different key insertion order from receiving different hashes while preserving ordered split membership.

The training/inference caller must persist the canonical JSON and the referenced run artifacts alongside each hash. Hash generation is deterministic, but it does not itself store source data, run training, attest an artifact or establish licensing.


## Registered shadow-inference boundary

`netlify/lib/ml-shadow-prediction.mts` is the guarded offline inference boundary. It accepts a registered model ID/version rather than caller-supplied artifact bytes, reloads the immutable artifact and registered dataset, checks the artifact's human-shadow eligibility, enforces exact feature-schema matching and requires every feature's source availability timestamp to be at or before the declared pre-kickoff cutoff. It computes the numeric HOME/DRAW/AWAY probabilities from the frozen logistic artifact, hashes the exact feature vector, and validates the resulting prediction envelope.

Prediction audit records are immutable and idempotent by prediction-run ID; conflicting reuse fails. The module is not exposed as a production endpoint or betting action. Production use and automated betting remain false. Synthetic tests cover invalid time windows, late features, malformed provenance and unknown model IDs. No live dataset or real model has been used.
