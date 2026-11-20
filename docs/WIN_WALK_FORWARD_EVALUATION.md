# WIN walk-forward evaluation envelope

This draft adds a disconnected evaluation boundary for issue #81 D1. It
consumes validated `win.prediction-ledger.v1` prediction and outcome entries and
returns a deterministic `win.walk-forward-evaluation.v1` report. It does not
train, select, promote or run a model. It performs no provider, network,
storage, AI, deployment, betting or financial operation.

## Explicit walk-forward policy

The caller supplies one to 50 non-overlapping folds. Each fold has a stable ID,
an inclusive training cutoff, an inclusive evaluation start and an exclusive
evaluation end. A global embargo in milliseconds must fit between the training
cutoff and evaluation start. All fold ends must be at or before the report's
calendar-valid, timezone-qualified `evaluationAsOf` instant.

A prediction is scoreable only when:

1. its event is inside exactly one declared evaluation window;
2. the model's `trainedThrough` instant is at or before that fold's training
   cutoff;
3. the immutable C4 ledger accepted the prediction and its independently
   verified outcome; and
4. the outcome was verified no later than `evaluationAsOf`.

The C4 boundary separately requires every feature and observed input price to
have been available by the prediction's information cutoff. The D1 evaluator
therefore refuses later-trained models and never treats a result verified after
the report's as-of instant as historical knowledge.

## Outcome trust and quarantine

Predictions without an eligible outcome are excluded with a fixed diagnostic.
Two accepted outcomes that disagree on `won`, `lost`, `void` or `push`
quarantine the prediction. Agreeing independent evidence is counted as
provenance but the prediction is scored once. `void` and `push` remain visible
in report totals and are never converted to binary wins or losses.

Malformed, tampered or ledger-conflicted inputs are not echoed. If a malformed
record reuses an otherwise valid prediction record ID, that prediction is
tainted and cannot be scored; an accompanying clean copy cannot restore trust.
Rejected outcome evidence is also traced through a recoverable prediction ID.
Two changed outcome versions sharing a ledger key therefore quarantine their
prediction even when a different accepted verifier record would otherwise
support a score. A malformed outcome cannot be laundered by retaining one clean
outcome. Independent clean predictions may still be evaluated.

When a rejected outcome-shaped record has no trustworthy prediction ID, the
report cannot attribute it safely. It does not guess or echo the value; instead,
`batchTrust` becomes `degraded_unlinked_rejected_outcome` and exposes only a
count. When all rejected outcome evidence is linkable, it is quarantined and
batch trust reports `rejected_records_quarantined`. Exclusions distinguish a
ledger record from a prediction and contain only a safe record ID, scope and
fixed diagnostic.

## Metrics and cohorts

Binary `won`/`lost` observations produce:

- Brier score;
- natural-log loss;
- fixed-width expected calibration error and populated-bin evidence; and
- wins, losses and scored sample counts.

Reports expose metrics per fold and per exact cohort. A cohort binds sport,
competition, market and market version, settlement rule, selection, model and
model version so unrelated tasks are not pooled. The caller chooses an explicit
minimum sample size. Metrics below it are labelled `insufficient_sample`.
Meeting the threshold changes the label only to
`measured_not_independently_validated`; `calibrationConclusion` remains null.
The envelope never declares a model calibrated, accurate, profitable or better
than another model.

Closing-line value is always `unavailable` because the C4 input price is not a
verified closing price. Distribution shift is always `unavailable` because no
reference distribution is supplied. Those conclusions require separately
defined evidence and cannot be inferred from this report.

## Bounded and deterministic behavior

- Input is capped from one through 500 ledger records; an oversized batch is
  rejected as a whole without inspecting or echoing records.
- Folds, bins and minimum samples have explicit bounds.
- Results, diagnostics, exclusions and cohorts have stable ordering.
- The report has a canonical SHA-256 content identity and is deeply frozen.
- No automatic retry or side effect is requested.

## Proven and unproven

Synthetic tests prove the local formulas, fold/embargo validation, model
training cutoff, as-of outcome boundary, cohort isolation, conflict quarantine,
malformed prediction and outcome replay tainting, unlinked-outcome trust
degradation, input-order stability, caps, redaction and in-memory immutability.

They do not prove source correctness, complete historical coverage, settlement
accuracy, closing-price capture, walk-forward performance on real seasons,
calibration, CLV, drift detection, predictive superiority, profitability,
durable storage or production operation. Independent real-data review,
season-out evaluation and model-governance gates remain required before D1 can
be considered complete.
