# WIN paired baseline comparison

This disconnected issue #81 D1 draft compares one candidate model report with
one reference-baseline report. It does not train, activate, select or promote a
model. It performs no network, provider, AI, storage, deployment, betting or
financial operation.

## Comparison evidence added to walk-forward reports

Each exact walk-forward cohort now binds producer, source-code hash, model ID
and version, and artifact hash. A changed artifact or source revision cannot be
silently pooled under one model label.

Every scored observation also produces a comparison unit containing:

- a SHA-256 unit ID derived from fold, canonical event/time, sport,
  competition, market/version, settlement rule, selection and verified binary
  target;
- its fold ID; and
- the observation's Brier and natural-log losses.

The unit ID excludes model identity and probability, so two distinct models
evaluated against the same event, selection and outcome receive the same unit
ID. It includes the target, so reports built from disagreeing settlement cannot
be paired. A cohort-level sample-set identity hashes the sorted unit IDs. Raw
event IDs and outcomes are not copied into the comparison report.

## Fail-closed report validation

`win.paired-baseline-comparison.v1` independently recomputes each source
report's canonical content identity. It rejects the whole comparison when:

- either report is tampered, partial, excluded, diagnostically degraded or not
  `accepted_ledger_records_only`;
- evaluation fold/as-of/bin/minimum-sample policies differ;
- a cohort has invalid or duplicate comparison units;
- one evidence cohort is missing a counterpart;
- more than one candidate or reference model occupies the same evidence
  cohort;
- candidate and reference are the same exact producer/source/model/artifact;
  or
- paired unit IDs or their fold assignments differ.

The caller separately caps cohort count and sets a minimum paired sample count.
Any mismatch rejects the whole comparison and returns no otherwise valid cohort
deltas, preventing selective use of a partial comparison. Rejected inputs
return fixed diagnostics and never echo report payloads. Canonical hashes prove
content integrity inside this boundary, not who produced the report or whether
its underlying real-world evidence is authentic.

## Descriptive paired loss output

For an exact pair, the report gives candidate and reference mean loss, the mean
candidate-minus-reference loss delta, candidate-lower/tied/reference-lower
counts, sample standard deviation and standard error for Brier and log loss.
Negative deltas mean the candidate had lower loss only on the observed paired
sample.

An approximate `mean ± 1.96 × standard error` interval is withheld until at
least 30 pairs and the caller's minimum are both satisfied. When present it is
labelled `normal_approximation_descriptive_only`; it is not a bootstrap,
multiple-comparison correction, season-clustered interval or proof of
generalization. Small samples remain `insufficient_paired_sample`.

`promotionAllowed` is always false and `superiorityConclusion` is always null,
both per comparison and for the whole report. Lower observed loss cannot automatically promote a model or establish calibration, predictive superiority
or profitability.

## Proven and unproven

Synthetic tests prove content-ID verification, exact-policy and exact-sample
pairing, artifact/source isolation, stable ordering, deterministic loss deltas,
small-sample abstention, the explicit approximate interval threshold,
deep-freeze behavior, caps, degraded-report rejection and payload redaction.

They do not prove source or settlement correctness, complete seasons,
representative sampling, independent prospective results, calibration, CLV,
drift, statistical significance, predictive superiority, profitability or
production operation. Real season-out data, independently reviewed settlement,
pre-registered comparisons and appropriate clustered/robust uncertainty remain
separate acceptance gates.
