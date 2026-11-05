import test from "node:test";
import assert from "node:assert/strict";
import { WIN_ML_DATASET_MANIFEST_VERSION, evaluateWinMLDatasetReadiness, validateWinMLDatasetManifest, validateWinMLTrainingExample } from "../netlify/lib/ml-data-contract.mts";
const manifest = (overrides = {}) => ({
  manifestVersion: WIN_ML_DATASET_MANIFEST_VERSION, datasetId: "synthetic-football-2026",
  providerId: "synthetic-fixture", sport: "association_football", competition: "synthetic-league",
  season: "2026", sourceUrl: "https://example.test/dataset", licenceId: "CC0-1.0",
  attributionRequired: false, automationAllowed: false, approvedForTraining: true, permittedUse: "training",
  rowGrain: "match", eventTimePrecision: "instant", retrievedAt: "2026-11-05T10:00:00.000Z",
  rowCount: 120, labeledRowCount: 120, schemaVersion: "football.match.v1", contentSha256: "a".repeat(64), ...overrides
});
const example = (overrides = {}) => ({
  datasetId: "synthetic-football-2026", sourceRecordId: "source-row-1", eventId: "match-1",
  eventStart: "2026-11-05T19:00:00.000Z", predictionCutoff: "2026-11-05T17:00:00.000Z",
  features: {
    prior_home_goals: { value: 1.4, availableAt: "2026-11-04T20:00:00.000Z", sourceId: "results-feed" },
    home_rest_days: { value: 6, availableAt: "2026-11-05T08:00:00.000Z", sourceId: "schedule-feed" }
  },
  label: { market: "1x2", outcome: "HOME", settlementRuleId: "football-1x2-ft-v1", settledAt: "2026-11-05T21:00:00.000Z" },
  ...overrides
});
test("dataset manifest validates immutable provenance and licence fields", () => {
  assert.deepEqual(validateWinMLDatasetManifest(manifest()), []);
  const errors = validateWinMLDatasetManifest(manifest({ sourceUrl: "http://example.test/data", contentSha256: "bad", attributionRequired: true, attributionText: "" }));
  assert.ok(errors.includes("source_url_must_be_https"));
  assert.ok(errors.includes("content_sha256_invalid"));
  assert.ok(errors.includes("required_attribution_missing"));
});
test("training readiness blocks research-only, unapproved and date-only sources", () => {
  assert.equal(evaluateWinMLDatasetReadiness(manifest()).eligible, true);
  assert.ok(evaluateWinMLDatasetReadiness(manifest({ permittedUse: "research_only" })).reasons.includes("licence_does_not_permit_training"));
  assert.ok(evaluateWinMLDatasetReadiness(manifest({ approvedForTraining: false })).reasons.includes("owner_training_approval_missing"));
  assert.ok(evaluateWinMLDatasetReadiness(manifest({ eventTimePrecision: "date" })).reasons.includes("exact_event_time_required_for_point_in_time_training"));
});
test("point-in-time feature and settlement label contract accepts clean synthetic examples", () => {
  assert.deepEqual(validateWinMLTrainingExample(manifest(), example()), []);
});
test("point-in-time contract rejects future features, post-kickoff cutoffs and invalid labels", () => {
  assert.ok(validateWinMLTrainingExample(manifest(), example({ features: { lineup: { value: "confirmed", availableAt: "2026-11-05T18:00:00.000Z", sourceId: "lineup-feed" } } })).includes("future_feature_leakage:lineup"));
  assert.ok(validateWinMLTrainingExample(manifest(), example({ predictionCutoff: "2026-11-05T19:00:00.000Z" })).includes("prediction_cutoff_must_precede_event"));
  assert.ok(validateWinMLTrainingExample(manifest(), example({ label: { market: "1x2", outcome: "OVER", settlementRuleId: "", settledAt: "invalid" } })).includes("settlement_aware_label_invalid"));
  assert.ok(validateWinMLTrainingExample(manifest(), example({ label: { market: "1x2", outcome: "HOME", settlementRuleId: "rule", settledAt: "2026-11-05T18:00:00.000Z" } })).includes("label_cannot_settle_before_event_start"));
});
test("training examples cannot cross dataset identities or use malformed feature provenance", () => {
  assert.ok(validateWinMLTrainingExample(manifest(), example({ datasetId: "different-dataset" })).includes("example_dataset_mismatch"));
  const errors = validateWinMLTrainingExample(manifest(), example({ features: { broken: { value: Number.NaN, availableAt: "not-a-date", sourceId: "" } } }));
  assert.ok(errors.includes("feature_provenance_invalid:broken"));
});
