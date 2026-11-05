# WIN ML model artifact and promotion gate

## Purpose

The ML data contract controls whether source data may be used for training. This second contract controls whether a trained model artifact has enough reproducible, out-of-sample evidence to be considered for a human-reviewed shadow evaluation.

It does not train a model, claim an edge, or promote a model into production.

## Required evidence

Each evaluation record binds:
- the exact dataset ID and SHA-256 content hash;
- model ID/version, algorithm, sport and market;
- feature schema version, unique feature names and target/settlement definition;
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
