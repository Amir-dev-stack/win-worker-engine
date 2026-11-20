import assert from "node:assert/strict";
import test from "node:test";
import {
  createOutcomeLedgerEntry,
  createPredictionLedgerEntry,
  validatePredictionLedgerBatch
} from "../netlify/lib/prediction-ledger-envelope.mts";

const hash = character => character.repeat(64);
const options = { maxBatchSize: 20 };

function predictionDraft(overrides = {}) {
  const base = {
    kind: "prediction",
    ledgerKey: "prediction:event-42:full-time-result:home:model-v1",
    eventId: "event-42",
    sportId: "football",
    competitionId: "competition-7",
    eventTime: "2026-11-20T20:00:00.000Z",
    informationCutoff: "2026-11-20T18:00:00.000Z",
    predictionTime: "2026-11-20T18:05:00.000Z",
    producerId: "win-model-lab",
    sourceCodeHash: hash("a"),
    model: {
      modelId: "football-baseline",
      modelVersion: "v1.2.0",
      artifactHash: hash("b"),
      trainedThrough: "2026-11-19T23:59:59.000Z"
    },
    market: {
      marketId: "full-time-result",
      marketVersion: "v1",
      settlementRuleId: "football-ft-1x2-v1",
      selectionId: "home-win"
    },
    probability: 0.57,
    price: {
      bookmakerId: "book-1",
      decimalOdds: 1.91,
      observedAt: "2026-11-20T17:55:00.000Z",
      availableAt: "2026-11-20T17:56:00.000Z"
    },
    features: [
      { snapshotId: hash("c"), featureSetId: "team-form", observedAt: "2026-11-20T16:00:00.000Z", availableAt: "2026-11-20T16:01:00.000Z" },
      { snapshotId: hash("d"), featureSetId: "lineup-status", observedAt: "2026-11-20T17:30:00.000Z", availableAt: "2026-11-20T17:31:00.000Z" }
    ]
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

function outcomeDraft(prediction, overrides = {}) {
  return {
    kind: "outcome",
    ledgerKey: `outcome:${prediction.recordId}`,
    predictionId: prediction.recordId,
    eventId: prediction.eventId,
    resultSnapshotId: hash("e"),
    resultObservedAt: "2026-11-20T22:00:00.000Z",
    verifiedAt: "2026-11-20T22:30:00.000Z",
    verifierId: "independent-reviewer",
    settlementRuleId: prediction.market.settlementRuleId,
    outcome: "won",
    evidenceHash: hash("f"),
    ...overrides
  };
}

test("creates deterministic deeply frozen prediction entries", () => {
  const first = createPredictionLedgerEntry(predictionDraft());
  const reordered = createPredictionLedgerEntry(predictionDraft({ features: [...predictionDraft().features].reverse() }));
  assert.equal(first.recordId, reordered.recordId);
  assert.match(first.recordId, /^[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.model), true);
  assert.equal(Object.isFrozen(first.features), true);
  assert.equal(Object.isFrozen(first.features[0]), true);
  assert.throws(() => { first.model.modelVersion = "v2"; }, /read only|Cannot assign/u);
});

test("rejects impossible timestamps and prediction chronology violations", () => {
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ eventTime: "2026-02-30T20:00:00.000Z" })), /chronology/u);
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ eventTime: "2026-11-20T20:00:00" })), /chronology/u);
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ informationCutoff: "2026-11-20T18:06:00.000Z" })), /chronology/u);
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ predictionTime: "2026-11-20T20:00:00.000Z" })), /chronology/u);
});

test("rejects model, feature and price leakage after the information cutoff", () => {
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ model: { trainedThrough: "2026-11-20T18:00:00.000Z" } })), /provenance/u);
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ features: [{ snapshotId: hash("c"), featureSetId: "late-data", observedAt: "2026-11-20T17:00:00.000Z", availableAt: "2026-11-20T18:00:00.001Z" }] })), /leakage/u);
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ price: { availableAt: "2026-11-20T18:00:01.000Z" } })), /leakage/u);
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ features: [{ snapshotId: hash("c"), featureSetId: "reversed-time", observedAt: "2026-11-20T17:01:00.000Z", availableAt: "2026-11-20T17:00:00.000Z" }] })), /leakage/u);
});

test("requires explicit valid market, probability, odds and unique feature snapshots", () => {
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ probability: 1 })), /probability/u);
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ market: { settlementRuleId: "" } })), /market/u);
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ price: { decimalOdds: 1 } })), /leakage/u);
  assert.throws(() => createPredictionLedgerEntry(predictionDraft({ features: [predictionDraft().features[0], predictionDraft().features[0]] })), /Duplicate/u);
});

test("batch output is stable and exact replays are deduplicated", () => {
  const first = createPredictionLedgerEntry(predictionDraft());
  const second = createPredictionLedgerEntry(predictionDraft({ ledgerKey: "prediction:event-43:totals:over:model-v1", eventId: "event-43", market: { marketId: "total-goals", settlementRuleId: "football-total-v1", selectionId: "over-2.5" } }));
  const forward = validatePredictionLedgerBatch([first, second, first], options);
  const reverse = validatePredictionLedgerBatch([first, second, first].reverse(), options);
  assert.deepEqual(forward, reverse);
  assert.equal(forward.status, "accepted");
  assert.equal(forward.accepted.length, 2);
  assert.deepEqual(forward.deduplicatedRecordIds, [first.recordId]);
});

test("tampered entries are rejected with redacted fixed diagnostics", () => {
  const prediction = createPredictionLedgerEntry(predictionDraft());
  const tampered = structuredClone(prediction);
  tampered.probability = 0.99;
  tampered.secretFixture = "must-not-echo";
  const result = validatePredictionLedgerBatch([tampered], options);
  assert.equal(result.status, "rejected");
  assert.deepEqual(result.diagnostics, ["TAMPERED_RECORD"]);
  assert.deepEqual(result.rejected, [{ recordId: prediction.recordId, diagnostics: ["TAMPERED_RECORD"] }]);
  assert.equal(JSON.stringify(result).includes("must-not-echo"), false);
  assert.equal(JSON.stringify(result).includes("0.99"), false);
});

test("changed replays of one ledger key are quarantined while independent evidence survives", () => {
  const original = createPredictionLedgerEntry(predictionDraft());
  const changed = createPredictionLedgerEntry(predictionDraft({ probability: 0.58 }));
  const clean = createPredictionLedgerEntry(predictionDraft({ ledgerKey: "prediction:event-44:draw:model-v1", eventId: "event-44", market: { selectionId: "draw" } }));
  const forward = validatePredictionLedgerBatch([original, clean, changed], options);
  const reverse = validatePredictionLedgerBatch([changed, clean, original], options);
  assert.deepEqual(forward, reverse);
  assert.equal(forward.status, "partial");
  assert.deepEqual(forward.diagnostics, ["CONFLICTING_RECORD"]);
  assert.deepEqual(forward.accepted.map(row => row.recordId), [clean.recordId]);
  assert.deepEqual(forward.rejected.map(row => row.recordId).sort(), [original.recordId, changed.recordId].sort());
});

test("accepts an independently verified outcome tied to the exact prediction", () => {
  const prediction = createPredictionLedgerEntry(predictionDraft());
  const outcome = createOutcomeLedgerEntry(outcomeDraft(prediction));
  const result = validatePredictionLedgerBatch([outcome, prediction], options);
  assert.equal(result.status, "accepted");
  assert.equal(result.accepted.length, 2);
  assert.equal(Object.isFrozen(outcome), true);
});

test("outcomes fail closed for missing or mismatched prediction evidence", () => {
  const prediction = createPredictionLedgerEntry(predictionDraft());
  const missing = createOutcomeLedgerEntry(outcomeDraft(prediction, { ledgerKey: "outcome:missing", predictionId: hash("9") }));
  const wrongRule = createOutcomeLedgerEntry(outcomeDraft(prediction, { ledgerKey: "outcome:wrong-rule", settlementRuleId: "other-rule" }));
  const sameActor = createOutcomeLedgerEntry(outcomeDraft(prediction, { ledgerKey: "outcome:same-actor", verifierId: prediction.producerId }));
  const premature = createOutcomeLedgerEntry(outcomeDraft(prediction, { ledgerKey: "outcome:premature", resultObservedAt: "2026-11-20T19:59:59.000Z", verifiedAt: "2026-11-20T20:10:00.000Z" }));
  const result = validatePredictionLedgerBatch([prediction, missing, wrongRule, sameActor, premature], options);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.diagnostics, ["MISSING_PREDICTION", "SETTLEMENT_MISMATCH"]);
  assert.deepEqual(result.accepted.map(row => row.recordId), [prediction.recordId]);
  assert.equal(result.rejected.length, 4);
});

test("outcomes can reference a separately validated prior prediction", () => {
  const prediction = createPredictionLedgerEntry(predictionDraft());
  const outcome = createOutcomeLedgerEntry(outcomeDraft(prediction));
  const result = validatePredictionLedgerBatch([outcome], { ...options, priorPredictions: [prediction] });
  assert.equal(result.status, "accepted");
  assert.deepEqual(result.accepted.map(row => row.recordId), [outcome.recordId]);
  assert.throws(() => validatePredictionLedgerBatch([outcome], { ...options, priorPredictions: [{ ...prediction, probability: 0.99 }] }), /prior prediction/u);
});

test("outcome construction requires ordered verification timestamps and evidence hashes", () => {
  const prediction = createPredictionLedgerEntry(predictionDraft());
  assert.throws(() => createOutcomeLedgerEntry(outcomeDraft(prediction, { verifiedAt: "2026-11-20T21:59:59.000Z" })), /verification/u);
  assert.throws(() => createOutcomeLedgerEntry(outcomeDraft(prediction, { evidenceHash: "not-a-hash" })), /identity/u);
  assert.throws(() => createOutcomeLedgerEntry(outcomeDraft(prediction, { outcome: "pending" })), /verification/u);
});

test("oversized batches fail as a whole without automatic replay", () => {
  const prediction = createPredictionLedgerEntry(predictionDraft());
  const result = validatePredictionLedgerBatch([prediction, prediction], { maxBatchSize: 1 });
  assert.deepEqual(result, {
    status: "rejected",
    diagnostics: ["BATCH_LIMIT_EXCEEDED"],
    accepted: [],
    rejected: [],
    deduplicatedRecordIds: [],
    retryDisposition: "split_batch_no_automatic_replay"
  });
});

test("batch configuration is bounded and rejects malformed input", () => {
  assert.throws(() => validatePredictionLedgerBatch({}, options), /array/u);
  assert.throws(() => validatePredictionLedgerBatch([], { maxBatchSize: 0 }), /limit/u);
  assert.throws(() => validatePredictionLedgerBatch([], { maxBatchSize: 501 }), /limit/u);
});
