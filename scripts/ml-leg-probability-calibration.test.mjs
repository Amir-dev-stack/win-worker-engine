import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWinLegProbabilityCalibration } from "../netlify/lib/ml-leg-probability-calibration.mts";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const row = (i, extra = {}) => ({
  observationId: "leg-" + i,
  sport: "football",
  market: "1x2_home",
  probabilityBasis: "agent_heuristic_unverified",
  confidence: "medium",
  estimatedWinProbabilityPercent: 70,
  outcome: i <= 70 ? "won" : "lost",
  predictionCutoff: "2026-11-01T10:00:00.000Z",
  kickoffAt: "2026-11-01T12:00:00.000Z",
  settledAt: "2026-11-01T14:00:00.000Z",
  evaluatedAt: "2026-11-02T00:00:00.000Z",
  chronologicalHoldout: true,
  forecastEvidenceSha256: hashA,
  settlementEvidenceSha256: hashB,
  ...extra
});

test("evaluates 100 chronological holdout leg estimates with proper scores and reliability bins", () => {
  const report = evaluateWinLegProbabilityCalibration(Array.from({ length: 100 }, (_, i) => row(i + 1)));
  assert.equal(report.status, "calibration_research_available");
  assert.equal(report.researchEligibleCohortCount, 1);
  const cohort = report.cohorts[0];
  assert.equal(cohort.settledObservations, 100);
  assert.equal(cohort.observedWinRate, 0.7);
  assert.equal(cohort.meanPredictedProbability, 0.7);
  assert.equal(cohort.calibrationGap, 0);
  assert.equal(cohort.expectedCalibrationError, 0);
  assert.equal(cohort.reliabilityBins.length, 10);
  assert.equal(cohort.probabilityCalibrationGranted, false);
  assert.equal(cohort.productionApprovalGranted, false);
  assert.equal(report.automaticBettingAllowed, false);
});

test("keeps cohorts below 100 settled observations research-ineligible", () => {
  const report = evaluateWinLegProbabilityCalibration(Array.from({ length: 99 }, (_, i) => row(i + 1)));
  assert.equal(report.status, "waiting_for_chronological_holdout");
  assert.equal(report.cohorts[0].status, "insufficient_sample");
  assert.equal(report.cohorts[0].researchEligible, false);
});

test("excludes duplicate IDs, invalid hashes, non-holdout rows and pushes/voids", () => {
  const input = Array.from({ length: 100 }, (_, i) => row(i + 1));
  input.push(row(1));
  input.push(row(101, { observationId: "non-holdout", chronologicalHoldout: false }));
  input.push(row(102, { observationId: "bad-hash", forecastEvidenceSha256: "not-a-hash" }));
  input.push(row(103, { observationId: "push", outcome: "push" }));
  input.push(row(104, { observationId: "void", outcome: "void" }));
  const report = evaluateWinLegProbabilityCalibration(input);
  assert.equal(report.exclusions.duplicate_observation_id, 1);
  assert.equal(report.exclusions.non_holdout_record, 1);
  assert.equal(report.exclusions.invalid_record, 1);
  assert.equal(report.exclusions.push_or_void, 2);
  assert.equal(report.cohorts[0].settledObservations, 100);
});

test("rejects time leakage and unverified registered-model provenance", () => {
  const lateCutoff = row(1, { predictionCutoff: "2026-11-01T12:01:00.000Z" });
  const earlySettlement = row(2, { settledAt: "2026-11-01T11:59:00.000Z" });
  const unverifiedModel = row(3, { probabilityBasis: "registered_model" });
  const report = evaluateWinLegProbabilityCalibration([lateCutoff, earlySettlement, unverifiedModel]);
  assert.equal(report.exclusions.invalid_record, 3);
  assert.equal(report.cohortCount, 0);
});

test("requires an explicit validation hash for registered-model probability cohorts", () => {
  const report = evaluateWinLegProbabilityCalibration(
    Array.from({ length: 100 }, (_, i) => row(i + 1, {
      probabilityBasis: "registered_model",
      modelValidationSha256: hashA
    }))
  );
  assert.equal(report.cohorts[0].probabilityBasis, "registered_model");
  assert.equal(report.cohorts[0].probabilityCalibrationGranted, false);
  assert.equal(report.cohorts[0].productionApprovalGranted, false);
});

test("does not permit a lower sample threshold", () => {
  assert.throws(() => evaluateWinLegProbabilityCalibration([], 50), /leg_probability_calibration_input_invalid/);
});
