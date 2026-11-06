import test from "node:test";
import assert from "node:assert/strict";
import { calculateWinMLMarketAnchoredBlend } from "../netlify/lib/ml-market-anchored-blend.mts";

const digest = value => value.repeat(64).slice(0, 64);

function input(overrides = {}) {
  return {
    event: {
      eventId: "fixture-001",
      kickoff: "2026-11-08T18:00:00.000Z",
      predictionCutoff: "2026-11-08T17:00:00.000Z"
    },
    market: {
      eventId: "fixture-001",
      at: "2026-11-08T16:30:00.000Z",
      sourceId: "licensed-market-feed",
      snapshotId: "market-snapshot-001",
      decimalOdds: { home: 2.1, draw: 3.4, away: 3.8 }
    },
    model: {
      eventId: "fixture-001",
      at: "2026-11-08T16:45:00.000Z",
      modelId: "registered-shadow-model-v1",
      trainedAt: "2026-10-01T00:00:00.000Z",
      artifactSha256: digest("a"),
      datasetContentSha256: digest("b"),
      featureVectorSha256: digest("c"),
      probabilities: { home: 0.52, draw: 0.25, away: 0.23 }
    },
    evaluation: {
      modelEvaluationId: "model-evaluation-001",
      marketEvaluationId: "market-evaluation-001",
      testCohortSha256: digest("d"),
      marketTestCohortSha256: digest("d"),
      datasetContentSha256: digest("b"),
      marketDataSha256: digest("e"),
      testRows: 500,
      modelLogLoss: 0.98,
      marketLogLoss: 1.03,
      modelBrier: 0.58,
      marketBrier: 0.61,
      expectedCalibrationError: 0.03,
      testLabelsAvailableAt: "2026-10-31T23:00:00.000Z",
      evaluationAsOf: "2026-11-01T00:00:00.000Z"
    },
    ...overrides
  };
}

test("market-anchored blend is research-only and caps ML influence at twenty percent", () => {
  const result = calculateWinMLMarketAnchoredBlend(input());
  assert.equal(result.status, "research_only");
  assert.equal(result.productionUseAllowed, false);
  assert.equal(result.automatedBettingAllowed, false);
  assert.ok(result.modelWeight > 0);
  assert.ok(result.modelWeight <= 0.20);
  assert.ok(Math.abs(result.probabilities.home + result.probabilities.draw + result.probabilities.away - 1) < 1e-12);
  assert.ok(result.evidenceSha256.length === 64);
  assert.ok(result.marketProbabilities.home > 0 && result.marketProbabilities.home < 1);
});

test("model contribution is zero when either held-out score is not better than the market", () => {
  const result = calculateWinMLMarketAnchoredBlend(input({
    evaluation: {
      ...input().evaluation,
      modelLogLoss: 1.04,
      modelBrier: 0.60
    }
  }));
  assert.equal(result.status, "blocked");
  assert.ok(result.reasons.includes("model_does_not_beat_market_on_both_metrics"));
  assert.equal(result.probabilities, null);
});

test("rejects a mismatched held-out cohort and insufficient sample size", () => {
  const mismatched = calculateWinMLMarketAnchoredBlend(input({
    evaluation: { ...input().evaluation, marketTestCohortSha256: digest("f") }
  }));
  assert.equal(mismatched.status, "blocked");
  assert.ok(mismatched.reasons.includes("held_out_evaluation_provenance_or_cohort_mismatch"));

  const small = calculateWinMLMarketAnchoredBlend(input({
    evaluation: { ...input().evaluation, testRows: 99 }
  }));
  assert.equal(small.status, "blocked");
  assert.ok(small.reasons.includes("held_out_evaluation_sample_too_small"));
});

test("rejects stale or post-cutoff market quotes and future model predictions", () => {
  const stale = calculateWinMLMarketAnchoredBlend(input({
    market: { ...input().market, at: "2026-11-08T10:00:00.000Z" }
  }));
  assert.equal(stale.status, "blocked");
  assert.ok(stale.reasons.includes("market_snapshot_missing_stale_or_after_cutoff"));

  const future = calculateWinMLMarketAnchoredBlend(input({
    model: { ...input().model, at: "2026-11-08T17:01:00.000Z" }
  }));
  assert.equal(future.status, "blocked");
  assert.ok(future.reasons.includes("model_prediction_after_cutoff"));
});

test("rejects poor calibration and evaluation performed before held-out labels were available", () => {
  const uncalibrated = calculateWinMLMarketAnchoredBlend(input({
    evaluation: { ...input().evaluation, expectedCalibrationError: 0.08 }
  }));
  assert.equal(uncalibrated.status, "blocked");
  assert.ok(uncalibrated.reasons.includes("model_calibration_gate_failed"));

  const premature = calculateWinMLMarketAnchoredBlend(input({
    evaluation: { ...input().evaluation, evaluationAsOf: "2026-10-30T00:00:00.000Z" }
  }));
  assert.equal(premature.status, "blocked");
  assert.ok(premature.reasons.includes("held_out_labels_not_available_as_of_evaluation"));
});

test("rejects invalid odds, model probability vectors and post-cutoff model training", () => {
  const odds = calculateWinMLMarketAnchoredBlend(input({
    market: { ...input().market, decimalOdds: { home: 1, draw: 3.4, away: 3.8 } }
  }));
  assert.equal(odds.status, "blocked");
  assert.ok(odds.reasons.includes("market_decimal_odds_invalid"));

  const probs = calculateWinMLMarketAnchoredBlend(input({
    model: { ...input().model, probabilities: { home: 0.8, draw: 0.8, away: -0.6 } }
  }));
  assert.equal(probs.status, "blocked");
  assert.ok(probs.reasons.includes("model_probabilities_invalid"));

  const trainedLater = calculateWinMLMarketAnchoredBlend(input({
    model: { ...input().model, trainedAt: "2026-11-08T17:01:00.000Z" }
  }));
  assert.equal(trainedLater.status, "blocked");
  assert.ok(trainedLater.reasons.includes("model_trained_after_prediction_cutoff"));
});
