import test from "node:test";
import assert from "node:assert/strict";
import { assertWinMarketCohortMatchesModel, WinMarketEvaluationError } from "../netlify/lib/win-market-evaluation-registry.mts";
import { hashWinMLProvenance } from "../netlify/lib/ml-provenance.mts";

function fixture() {
  const rows = Array.from({ length: 100 }, (_, index) => ({
    eventId: "fixture-event-" + index,
    kickoffAt: "2026-06-01T18:00:00.000Z",
    predictionCutoff: "2026-06-01T17:00:00.000Z",
    marketSnapshotAt: "2026-06-01T16:55:00.000Z",
    resultAvailableAt: "2026-06-01T20:00:00.000Z",
    probabilities: [0.5, 0.25, 0.25],
    outcome: index % 3 === 0 ? "home" : index % 3 === 1 ? "draw" : "away"
  }));
  const testEventIds = rows.map(row => row.eventId);
  const evaluation = {
    market: "1x2",
    testRows: rows.length,
    testEventIds,
    testCohortSha256: hashWinMLProvenance([...testEventIds].sort()).sha256,
    testEventCutoffs: rows.map(row => ({ eventId: row.eventId, predictionCutoff: row.predictionCutoff }))
  };
  return { rows, evaluation };
}

test("market benchmark requires exact registered held-out event identities and cutoffs", () => {
  const { rows, evaluation } = fixture();
  assert.doesNotThrow(() => assertWinMarketCohortMatchesModel(rows, evaluation));
});

test("market benchmark rejects a different event cohort even at the same sample size", () => {
  const { rows, evaluation } = fixture();
  const changed = rows.map((row, index) => index === 99 ? { ...row, eventId: "another-event" } : row);
  assert.throws(() => assertWinMarketCohortMatchesModel(changed, evaluation), error =>
    error instanceof WinMarketEvaluationError && error.code === "market_evaluation_model_cohort_mismatch"
  );
});

test("market benchmark rejects per-event prediction cutoff drift", () => {
  const { rows, evaluation } = fixture();
  const changed = rows.map((row, index) => index === 20
    ? { ...row, predictionCutoff: "2026-06-01T16:00:00.000Z" }
    : row);
  assert.throws(() => assertWinMarketCohortMatchesModel(changed, evaluation), error =>
    error instanceof WinMarketEvaluationError && error.code === "market_evaluation_prediction_cutoff_mismatch"
  );
});

test("market benchmark rejects duplicate model cutoff identities and malformed cutoff timestamps", () => {
  const { rows, evaluation } = fixture();
  const duplicate = { ...evaluation, testEventCutoffs: [...evaluation.testEventCutoffs] };
  duplicate.testEventCutoffs[99] = { ...duplicate.testEventCutoffs[0] };
  assert.throws(() => assertWinMarketCohortMatchesModel(rows, duplicate), /market_evaluation_model_cutoffs_invalid/);
  const malformed = { ...evaluation, testEventCutoffs: evaluation.testEventCutoffs.map((item, index) =>
    index === 0 ? { ...item, predictionCutoff: "2026-02-31T17:00:00.000Z" } : item
  ) };
  assert.throws(() => assertWinMarketCohortMatchesModel(rows, malformed), /market_evaluation_model_cutoffs_invalid/);
});
