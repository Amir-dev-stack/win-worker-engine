import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createOutcomeLedgerEntry,
  createPredictionLedgerEntry
} from "../netlify/lib/prediction-ledger-envelope.mts";
import { comparePairedBaselineReports } from "../netlify/lib/paired-baseline-comparison.mts";
import { evaluateWalkForwardLedger } from "../netlify/lib/walk-forward-evaluation.mts";

const digest = value => createHash("sha256").update(String(value)).digest("hex");

const models = {
  candidate: {
    producerId: "candidate-lab",
    sourceCodeHash: digest("candidate-source"),
    modelId: "candidate-model",
    modelVersion: "v2",
    artifactHash: digest("candidate-artifact")
  },
  reference: {
    producerId: "reference-lab",
    sourceCodeHash: digest("reference-source"),
    modelId: "frequency-baseline",
    modelVersion: "v1",
    artifactHash: digest("reference-artifact")
  },
  alternate: {
    producerId: "candidate-lab",
    sourceCodeHash: digest("alternate-source"),
    modelId: "candidate-model-alternate",
    modelVersion: "v1",
    artifactHash: digest("alternate-artifact")
  }
};

function evaluationOptions(overrides = {}) {
  return {
    evaluationAsOf: "2026-02-02T00:00:00.000Z",
    folds: [{
      foldId: "season-out-fold",
      trainingCutoff: "2025-12-15T00:00:00.000Z",
      evaluationStart: "2026-01-01T00:00:00.000Z",
      evaluationEnd: "2026-02-01T00:00:00.000Z"
    }],
    embargoMilliseconds: 86_400_000,
    calibrationBins: 5,
    minimumScoredSamples: 2,
    maxRecords: 100,
    ...overrides
  };
}

function prediction(model, index, probability, overrides = {}) {
  const day = String(index + 1).padStart(2, "0");
  const competitionId = overrides.competitionId ?? "league-1";
  return createPredictionLedgerEntry({
    kind: "prediction",
    ledgerKey: `prediction:${competitionId}:event-${index}:home:${model.modelId}:${model.modelVersion}`,
    eventId: `event-${index}`,
    sportId: "football",
    competitionId,
    eventTime: `2026-01-${day}T20:00:00.000Z`,
    informationCutoff: `2026-01-${day}T18:00:00.000Z`,
    predictionTime: `2026-01-${day}T18:05:00.000Z`,
    producerId: model.producerId,
    sourceCodeHash: model.sourceCodeHash,
    model: {
      modelId: model.modelId,
      modelVersion: model.modelVersion,
      artifactHash: model.artifactHash,
      trainedThrough: "2025-12-14T23:59:59.000Z"
    },
    market: {
      marketId: "full-time-result",
      marketVersion: "v1",
      settlementRuleId: "football-ft-1x2-v1",
      selectionId: "home-win"
    },
    probability,
    price: null,
    features: [{
      snapshotId: digest(`feature-${index}`),
      featureSetId: "team-form",
      observedAt: `2026-01-${day}T16:00:00.000Z`,
      availableAt: `2026-01-${day}T16:01:00.000Z`
    }]
  });
}

function outcome(predictionEntry, index, target) {
  const day = String(index + 1).padStart(2, "0");
  return createOutcomeLedgerEntry({
    kind: "outcome",
    ledgerKey: `outcome:${predictionEntry.recordId}`,
    predictionId: predictionEntry.recordId,
    eventId: predictionEntry.eventId,
    resultSnapshotId: digest(`result-${index}`),
    resultObservedAt: `2026-01-${day}T22:00:00.000Z`,
    verifiedAt: `2026-01-${day}T22:30:00.000Z`,
    verifierId: "independent-reviewer",
    settlementRuleId: predictionEntry.market.settlementRuleId,
    outcome: target ? "won" : "lost",
    evidenceHash: digest(`evidence-${index}`)
  });
}

function report(model, samples, options = evaluationOptions(), overrides = {}) {
  const rows = [];
  for (const sample of samples) {
    const entry = prediction(model, sample.index, sample.probability, overrides);
    rows.push(entry, outcome(entry, sample.index, sample.target));
  }
  return evaluateWalkForwardLedger(rows, options);
}

const candidateSamples = [
  { index: 1, probability: 0.8, target: 1 },
  { index: 2, probability: 0.2, target: 0 }
];
const referenceSamples = [
  { index: 1, probability: 0.6, target: 1 },
  { index: 2, probability: 0.4, target: 0 }
];
const comparisonOptions = { minimumPairedSamples: 2, maxCohorts: 10 };

test("compares exact paired candidate and reference losses without promotion", () => {
  const candidate = report(models.candidate, candidateSamples);
  const reference = report(models.reference, referenceSamples);
  const compared = comparePairedBaselineReports(candidate, reference, comparisonOptions);

  assert.equal(compared.status, "compared");
  assert.equal(compared.comparisons.length, 1);
  assert.equal(compared.comparisons[0].pairedSampleCount, 2);
  assert.equal(compared.comparisons[0].brier.meanDeltaCandidateMinusReference, -0.12);
  assert.equal(compared.comparisons[0].brier.candidateLowerLossCount, 2);
  assert.equal(compared.comparisons[0].logLoss.meanDeltaCandidateMinusReference, -0.287682072452);
  assert.equal(compared.comparisons[0].evidenceStatus, "paired_descriptive_not_independently_validated");
  assert.equal(compared.comparisons[0].promotionAllowed, false);
  assert.equal(compared.comparisons[0].superiorityConclusion, null);
  assert.equal(compared.promotionAllowed, false);
  assert.equal(compared.superiorityConclusion, null);
});

test("is stable across ledger input order and deeply freezes comparison output", () => {
  const candidate = report(models.candidate, [...candidateSamples].reverse());
  const reference = report(models.reference, [...referenceSamples].reverse());
  const forward = comparePairedBaselineReports(candidate, reference, comparisonOptions);
  const repeat = comparePairedBaselineReports(candidate, reference, comparisonOptions);

  assert.deepEqual(forward, repeat);
  assert.equal(Object.isFrozen(forward), true);
  assert.equal(Object.isFrozen(forward.comparisons), true);
  assert.equal(Object.isFrozen(forward.comparisons[0].brier), true);
  assert.throws(() => { forward.comparisons[0].candidateModel.modelVersion = "changed"; }, /read only|Cannot assign/u);
});

test("rejects tampered reports with fixed diagnostics and no payload echo", () => {
  const candidate = report(models.candidate, candidateSamples);
  const reference = report(models.reference, referenceSamples);
  const tampered = { ...candidate, privatePayload: "must-not-echo" };
  const compared = comparePairedBaselineReports(tampered, reference, comparisonOptions);

  assert.equal(compared.status, "rejected");
  assert.deepEqual(compared.diagnostics, ["INVALID_REPORT"]);
  assert.deepEqual(compared.comparisons, []);
  assert.equal(JSON.stringify(compared).includes("must-not-echo"), false);
});

test("rejects different evaluation policies before cohort comparison", () => {
  const candidate = report(models.candidate, candidateSamples);
  const reference = report(models.reference, referenceSamples, evaluationOptions({ calibrationBins: 4 }));
  const compared = comparePairedBaselineReports(candidate, reference, comparisonOptions);

  assert.equal(compared.status, "rejected");
  assert.deepEqual(compared.diagnostics, ["POLICY_MISMATCH"]);
});

test("rejects sample-set mismatch even when sample counts are equal", () => {
  const candidate = report(models.candidate, candidateSamples);
  const reference = report(models.reference, [referenceSamples[0], { index: 3, probability: 0.4, target: 0 }]);
  const compared = comparePairedBaselineReports(candidate, reference, comparisonOptions);

  assert.equal(compared.status, "rejected");
  assert.deepEqual(compared.diagnostics, ["SAMPLE_SET_MISMATCH"]);
  assert.deepEqual(compared.comparisons, []);
});

test("rejects degraded source report trust before using clean-looking metrics", () => {
  const candidate = report(models.candidate, candidateSamples);
  const reference = report(models.reference, referenceSamples);
  const degraded = evaluateWalkForwardLedger([
    ...candidateSamples.flatMap(sample => {
      const entry = prediction(models.candidate, sample.index, sample.probability);
      return [entry, outcome(entry, sample.index, sample.target)];
    }),
    { kind: "outcome", recordId: "bad", predictionId: "bad", privatePayload: "must-not-echo" }
  ], evaluationOptions());
  const compared = comparePairedBaselineReports(degraded, reference, comparisonOptions);

  assert.equal(compared.status, "rejected");
  assert.deepEqual(compared.diagnostics, ["DEGRADED_REPORT_TRUST"]);
  assert.equal(JSON.stringify(compared).includes("must-not-echo"), false);
});

test("rejects ambiguous multiple candidate models for one evidence cohort", () => {
  const rows = [];
  for (const sample of candidateSamples) {
    for (const model of [models.candidate, models.alternate]) {
      const entry = prediction(model, sample.index, sample.probability);
      rows.push(entry, outcome(entry, sample.index, sample.target));
    }
  }
  const candidate = evaluateWalkForwardLedger(rows, evaluationOptions());
  const reference = report(models.reference, referenceSamples);
  const compared = comparePairedBaselineReports(candidate, reference, comparisonOptions);

  assert.equal(compared.status, "rejected");
  assert.deepEqual(compared.diagnostics, ["AMBIGUOUS_COHORT"]);
});

test("rejects comparing one model identity with itself", () => {
  const candidate = report(models.candidate, candidateSamples);
  const compared = comparePairedBaselineReports(candidate, candidate, comparisonOptions);

  assert.equal(compared.status, "rejected");
  assert.deepEqual(compared.diagnostics, ["IDENTICAL_MODEL"]);
});

test("rejects cohorts without an exact counterpart", () => {
  const candidate = report(models.candidate, candidateSamples);
  const reference = report(models.reference, referenceSamples, evaluationOptions(), { competitionId: "league-2" });
  const compared = comparePairedBaselineReports(candidate, reference, comparisonOptions);

  assert.equal(compared.status, "rejected");
  assert.deepEqual(compared.diagnostics, ["MISSING_COUNTERPART"]);
});

test("one mismatched cohort rejects every otherwise valid comparison", () => {
  const candidateRows = [];
  const referenceRows = [];
  for (const competitionId of ["league-1", "league-extra"]) {
    for (const sample of candidateSamples) {
      const entry = prediction(models.candidate, sample.index, sample.probability, { competitionId });
      candidateRows.push(entry, outcome(entry, sample.index, sample.target));
    }
  }
  for (const sample of referenceSamples) {
    const entry = prediction(models.reference, sample.index, sample.probability);
    referenceRows.push(entry, outcome(entry, sample.index, sample.target));
  }
  const candidate = evaluateWalkForwardLedger(candidateRows, evaluationOptions());
  const reference = evaluateWalkForwardLedger(referenceRows, evaluationOptions());
  const compared = comparePairedBaselineReports(candidate, reference, comparisonOptions);

  assert.equal(compared.status, "rejected");
  assert.deepEqual(compared.diagnostics, ["MISSING_COUNTERPART"]);
  assert.deepEqual(compared.comparisons, []);
});

test("keeps small paired samples explicitly insufficient and withholds interval", () => {
  const candidate = report(models.candidate, candidateSamples);
  const reference = report(models.reference, referenceSamples);
  const compared = comparePairedBaselineReports(candidate, reference, { minimumPairedSamples: 3, maxCohorts: 10 });

  assert.equal(compared.status, "compared");
  assert.equal(compared.comparisons[0].evidenceStatus, "insufficient_paired_sample");
  assert.equal(compared.comparisons[0].brier.approximate95Interval, null);
  assert.equal(compared.comparisons[0].brier.uncertaintyStatus, "insufficient_sample_for_interval");
});

test("reports an explicitly approximate interval only at thirty paired samples", () => {
  const candidateRows = [];
  const referenceRows = [];
  for (let index = 1; index <= 30; index += 1) {
    const target = index % 2;
    candidateRows.push({ index, probability: target ? 0.7 : 0.3, target });
    referenceRows.push({ index, probability: target ? 0.6 : 0.4, target });
  }
  const candidate = report(models.candidate, candidateRows);
  const reference = report(models.reference, referenceRows);
  const compared = comparePairedBaselineReports(candidate, reference, { minimumPairedSamples: 30, maxCohorts: 10 });

  assert.equal(compared.comparisons[0].pairedSampleCount, 30);
  assert.deepEqual(compared.comparisons[0].brier.approximate95Interval, { lower: -0.07, upper: -0.07 });
  assert.equal(compared.comparisons[0].brier.uncertaintyStatus, "normal_approximation_descriptive_only");
  assert.equal(compared.comparisons[0].superiorityConclusion, null);
});

test("bounds configuration before report inspection", () => {
  assert.throws(() => comparePairedBaselineReports({ privatePayload: "secret" }, {}, { minimumPairedSamples: 1, maxCohorts: 10 }), /sample minimum/u);
  assert.throws(() => comparePairedBaselineReports({}, {}, { minimumPairedSamples: 2, maxCohorts: 501 }), /cohort limit/u);
});
