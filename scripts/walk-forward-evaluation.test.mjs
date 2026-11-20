import assert from "node:assert/strict";
import test from "node:test";

import {
  createOutcomeLedgerEntry,
  createPredictionLedgerEntry
} from "../netlify/lib/prediction-ledger-envelope.mts";
import { evaluateWalkForwardLedger } from "../netlify/lib/walk-forward-evaluation.mts";

const hash = character => character.repeat(64);
const hexHash = (sequence, offset = 0) => hash("abcdef0123456789"[(sequence + offset) % 16]);

function predictionDraft(sequence, overrides = {}) {
  const eventDay = String(3 + sequence).padStart(2, "0");
  const base = {
    kind: "prediction",
    ledgerKey: `prediction:event-${sequence}:home:model-v1`,
    eventId: `event-${sequence}`,
    sportId: "football",
    competitionId: "league-1",
    eventTime: `2026-01-${eventDay}T20:00:00.000Z`,
    informationCutoff: `2026-01-${eventDay}T18:00:00.000Z`,
    predictionTime: `2026-01-${eventDay}T18:05:00.000Z`,
    producerId: "win-baseline-lab",
    sourceCodeHash: hexHash(sequence),
    model: {
      modelId: "football-frequency-baseline",
      modelVersion: "v1",
      artifactHash: hexHash(sequence, 3),
      trainedThrough: "2025-12-31T23:00:00.000Z"
    },
    market: {
      marketId: "full-time-result",
      marketVersion: "v1",
      settlementRuleId: "football-ft-1x2-v1",
      selectionId: "home-win"
    },
    probability: 0.8,
    price: {
      bookmakerId: "book-1",
      decimalOdds: 1.8,
      observedAt: `2026-01-${eventDay}T17:30:00.000Z`,
      availableAt: `2026-01-${eventDay}T17:31:00.000Z`
    },
    features: [{
      snapshotId: hexHash(sequence, 7),
      featureSetId: "team-form",
      observedAt: `2026-01-${eventDay}T16:00:00.000Z`,
      availableAt: `2026-01-${eventDay}T16:01:00.000Z`
    }]
  };
  return {
    ...base,
    ...overrides,
    model: { ...base.model, ...(overrides.model ?? {}) },
    market: { ...base.market, ...(overrides.market ?? {}) },
    price: overrides.price === null ? null : { ...base.price, ...(overrides.price ?? {}) },
    features: overrides.features ?? base.features
  };
}

function outcomeDraft(prediction, sequence, overrides = {}) {
  const eventDay = String(3 + sequence).padStart(2, "0");
  return {
    kind: "outcome",
    ledgerKey: `outcome:${prediction.recordId}:${overrides.verifierId ?? "reviewer-a"}`,
    predictionId: prediction.recordId,
    eventId: prediction.eventId,
    resultSnapshotId: hexHash(sequence, 9),
    resultObservedAt: `2026-01-${eventDay}T22:00:00.000Z`,
    verifiedAt: `2026-01-${eventDay}T22:30:00.000Z`,
    verifierId: "reviewer-a",
    settlementRuleId: prediction.market.settlementRuleId,
    outcome: "won",
    evidenceHash: hexHash(sequence, 11),
    ...overrides
  };
}

function options(overrides = {}) {
  return {
    evaluationAsOf: "2026-01-31T23:59:59.000Z",
    folds: [
      {
        foldId: "fold-1",
        trainingCutoff: "2026-01-01T00:00:00.000Z",
        evaluationStart: "2026-01-03T00:00:00.000Z",
        evaluationEnd: "2026-01-10T00:00:00.000Z"
      },
      {
        foldId: "fold-2",
        trainingCutoff: "2026-01-10T00:00:00.000Z",
        evaluationStart: "2026-01-12T00:00:00.000Z",
        evaluationEnd: "2026-01-20T00:00:00.000Z"
      }
    ],
    embargoMilliseconds: 86_400_000,
    calibrationBins: 5,
    minimumScoredSamples: 2,
    maxRecords: 100,
    ...overrides
  };
}

function pair(sequence, predictionOverrides = {}, outcomeOverrides = {}) {
  const prediction = createPredictionLedgerEntry(predictionDraft(sequence, predictionOverrides));
  const outcome = createOutcomeLedgerEntry(outcomeDraft(prediction, sequence, outcomeOverrides));
  return { prediction, outcome };
}

test("computes deterministic Brier, log-loss and fixed-bin ECE", () => {
  const first = pair(1, { probability: 0.8 });
  const second = pair(2, { probability: 0.3 }, { outcome: "lost" });
  const report = evaluateWalkForwardLedger([first.prediction, first.outcome, second.prediction, second.outcome], options());

  assert.equal(report.status, "evaluated");
  assert.equal(report.totals.scoredCount, 2);
  assert.equal(report.cohorts.length, 1);
  assert.equal(report.cohorts[0].brierScore, 0.065);
  assert.equal(report.cohorts[0].logLoss, 0.289909247626);
  assert.equal(report.cohorts[0].expectedCalibrationError, 0.25);
  assert.equal(report.cohorts[0].evidenceStatus, "measured_not_independently_validated");
  assert.equal(report.cohorts[0].calibrationConclusion, null);
  assert.match(report.reportId, /^[a-f0-9]{64}$/u);
});

test("is input-order invariant and deeply freezes the report", () => {
  const first = pair(1, { probability: 0.8 });
  const second = pair(2, { probability: 0.3 }, { outcome: "lost" });
  const rows = [first.prediction, first.outcome, second.prediction, second.outcome];
  const forward = evaluateWalkForwardLedger(rows, options());
  const reverse = evaluateWalkForwardLedger([...rows].reverse(), options({ folds: [...options().folds].reverse() }));

  assert.deepEqual(forward, reverse);
  assert.equal(Object.isFrozen(forward), true);
  assert.equal(Object.isFrozen(forward.cohorts), true);
  assert.equal(Object.isFrozen(forward.cohorts[0].identity), true);
  assert.throws(() => { forward.cohorts[0].identity.modelVersion = "changed"; }, /read only|Cannot assign/u);
});

test("quarantines model training after a fold cutoff", () => {
  const leaked = pair(1, { model: { trainedThrough: "2026-01-02T12:00:00.000Z" } });
  const clean = pair(2, { probability: 0.4 }, { outcome: "lost" });
  const report = evaluateWalkForwardLedger([leaked.prediction, leaked.outcome, clean.prediction, clean.outcome], options());

  assert.equal(report.status, "partial");
  assert.equal(report.totals.scoredCount, 1);
  assert.deepEqual(report.diagnostics, ["MODEL_TRAINING_LEAKAGE"]);
  assert.deepEqual(report.excluded, [{ recordId: leaked.prediction.recordId, scope: "prediction", diagnostics: ["MODEL_TRAINING_LEAKAGE"] }]);
});

test("requires valid non-overlapping embargoed folds", () => {
  assert.throws(() => evaluateWalkForwardLedger([], options({ folds: [{ foldId: "bad", trainingCutoff: "2026-01-02T12:00:00.000Z", evaluationStart: "2026-01-03T00:00:00.000Z", evaluationEnd: "2026-01-04T00:00:00.000Z" }] })), /chronology/u);
  assert.throws(() => evaluateWalkForwardLedger([], options({ folds: [options().folds[0], { foldId: "overlap", trainingCutoff: "2026-01-01T00:00:00.000Z", evaluationStart: "2026-01-09T00:00:00.000Z", evaluationEnd: "2026-01-11T00:00:00.000Z" }] })), /Overlapping/u);
  assert.throws(() => evaluateWalkForwardLedger([], options({ folds: [{ ...options().folds[0], foldId: "bad-date", evaluationStart: "2026-02-30T00:00:00.000Z" }] })), /chronology/u);
});

test("quarantines conflicting independently verified outcomes", () => {
  const prediction = createPredictionLedgerEntry(predictionDraft(1));
  const won = createOutcomeLedgerEntry(outcomeDraft(prediction, 1, { verifierId: "reviewer-a", outcome: "won" }));
  const lost = createOutcomeLedgerEntry(outcomeDraft(prediction, 1, { verifierId: "reviewer-b", outcome: "lost", resultSnapshotId: hash("1"), evidenceHash: hash("2") }));
  const report = evaluateWalkForwardLedger([prediction, won, lost], options());

  assert.equal(report.status, "insufficient_evidence");
  assert.deepEqual(report.diagnostics, ["CONFLICTING_OUTCOME"]);
  assert.equal(report.totals.scoredCount, 0);
  assert.deepEqual(report.excluded, [{ recordId: prediction.recordId, scope: "prediction", diagnostics: ["CONFLICTING_OUTCOME"] }]);
});

test("counts agreeing outcome evidence without double-scoring a prediction", () => {
  const prediction = createPredictionLedgerEntry(predictionDraft(1));
  const first = createOutcomeLedgerEntry(outcomeDraft(prediction, 1, { verifierId: "reviewer-a" }));
  const second = createOutcomeLedgerEntry(outcomeDraft(prediction, 1, { verifierId: "reviewer-b", resultSnapshotId: hash("1"), evidenceHash: hash("2") }));
  const report = evaluateWalkForwardLedger([prediction, first, second], options());

  assert.equal(report.totals.scoredCount, 1);
  assert.equal(report.cohorts[0].outcomeEvidenceCount, 2);
  assert.equal(report.cohorts[0].scoredCount, 1);
});

test("excludes missing and post-as-of outcomes with fixed redacted diagnostics", () => {
  const missing = createPredictionLedgerEntry(predictionDraft(1));
  const late = pair(2, {}, { verifiedAt: "2026-02-01T00:00:00.000Z" });
  const report = evaluateWalkForwardLedger([missing, late.prediction, late.outcome], options());

  assert.deepEqual(report.diagnostics, ["MISSING_OUTCOME", "OUTCOME_AFTER_AS_OF"]);
  assert.deepEqual(report.excluded.map(item => item.recordId), [missing.recordId, late.prediction.recordId].sort());
  assert.equal(JSON.stringify(report).includes("reviewer-a"), false);
});

test("counts void and push outcomes but never includes them in scores", () => {
  const voided = pair(1, {}, { outcome: "void" });
  const pushed = pair(2, {}, { outcome: "push" });
  const report = evaluateWalkForwardLedger([voided.prediction, voided.outcome, pushed.prediction, pushed.outcome], options());

  assert.equal(report.status, "insufficient_evidence");
  assert.equal(report.totals.voidOrPushCount, 2);
  assert.equal(report.totals.scoredCount, 0);
  assert.equal(report.folds[0].brierScore, null);
});

test("keeps competitions, markets, selections and model versions in separate cohorts", () => {
  const first = pair(1);
  const second = pair(2, { competitionId: "league-2" });
  const third = pair(3, { model: { modelVersion: "v2" }, market: { selectionId: "away-win" } }, { outcome: "lost" });
  const report = evaluateWalkForwardLedger([first.prediction, first.outcome, second.prediction, second.outcome, third.prediction, third.outcome], options());

  assert.equal(report.cohorts.length, 3);
  assert.deepEqual(report.cohorts.map(item => item.identity.competitionId), ["league-1", "league-1", "league-2"]);
  assert.equal(report.cohorts.every(item => item.evidenceStatus === "insufficient_sample"), true);
});

test("makes CLV, drift and calibration conclusions explicitly unavailable", () => {
  const first = pair(1, { price: null });
  const report = evaluateWalkForwardLedger([first.prediction, first.outcome], options());

  assert.deepEqual(report.comparativeEvidence, {
    closingLineValue: { status: "unavailable", reason: "closing_price_not_in_ledger" },
    distributionShift: { status: "unavailable", reason: "reference_distribution_not_supplied" }
  });
  assert.equal(report.cohorts[0].calibrationConclusion, null);
  assert.deepEqual(report.limitations, ["offline_ledger_evaluation_only", "no_predictive_superiority_claim", "no_model_promotion"]);
});

test("rejects an oversized batch without inspecting or echoing records", () => {
  const first = pair(1);
  const rows = Array.from({ length: 101 }, () => first.prediction);
  const report = evaluateWalkForwardLedger(rows, options({ maxRecords: 100 }));

  assert.equal(report.status, "rejected");
  assert.deepEqual(report.diagnostics, ["INVALID_LEDGER_RECORD"]);
  assert.deepEqual(report.excluded, []);
  assert.equal(report.retryDisposition, "do_not_retry_automatically");
  assert.equal(report.totals.inputRecords, 101);
  assert.equal(JSON.stringify(report).includes(first.prediction.recordId), false);
});

test("taints a prediction when a malformed replay reuses its record identity", () => {
  const tainted = pair(1);
  const independent = pair(2, { probability: 0.4 }, { outcome: "lost" });
  const tampered = { ...tainted.prediction, probability: 0.99 };
  const report = evaluateWalkForwardLedger([tainted.prediction, tainted.outcome, tampered, independent.prediction, independent.outcome], options());

  assert.equal(report.status, "partial");
  assert.equal(report.totals.scoredCount, 1);
  assert.equal(report.totals.excludedPredictionCount, 1);
  assert.deepEqual(report.diagnostics, ["INVALID_LEDGER_RECORD"]);
  assert.deepEqual(report.excluded, [{ recordId: tainted.prediction.recordId, scope: "prediction", diagnostics: ["INVALID_LEDGER_RECORD"] }]);
  assert.equal(report.cohorts[0].losses, 1);
});

test("excludes events outside explicit evaluation windows", () => {
  const outside = pair(8);
  const report = evaluateWalkForwardLedger([outside.prediction, outside.outcome], options());

  assert.equal(report.status, "insufficient_evidence");
  assert.deepEqual(report.diagnostics, ["OUTSIDE_EVALUATION_WINDOW"]);
  assert.equal(report.totals.scoredCount, 0);
});
