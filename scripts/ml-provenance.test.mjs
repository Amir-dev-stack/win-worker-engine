import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeWinMLProvenance,
  hashWinMLFeatureVector,
  hashWinMLProvenance,
  hashWinMLSplitManifest,
  hashWinMLTrainingConfig
} from "../netlify/lib/ml-provenance.mts";

test("canonical provenance hashes ignore object insertion order", () => {
  const left = hashWinMLTrainingConfig({ seed: 42, algorithm: "logistic_regression", params: { l2: 0.01, epochs: 800 } });
  const right = hashWinMLTrainingConfig({ params: { epochs: 800, l2: 0.01 }, algorithm: "logistic_regression", seed: 42 });
  assert.equal(left.canonicalJson, right.canonicalJson);
  assert.equal(left.sha256, right.sha256);
  assert.match(left.sha256, /^[a-f0-9]{64}$/);
});

test("canonical provenance hashes preserve array order", () => {
  const first = hashWinMLSplitManifest({
    trainingEventIds: ["a", "b"], validationEventIds: ["c"], testEventIds: ["d"],
    trainingEndsAt: "2025-01-01T00:00:00Z", validationStartsAt: "2025-01-02T00:00:00Z",
    validationEndsAt: "2025-01-03T00:00:00Z", testStartsAt: "2025-01-04T00:00:00Z"
  });
  const second = hashWinMLSplitManifest({
    trainingEventIds: ["b", "a"], validationEventIds: ["c"], testEventIds: ["d"],
    trainingEndsAt: "2025-01-01T00:00:00Z", validationStartsAt: "2025-01-02T00:00:00Z",
    validationEndsAt: "2025-01-03T00:00:00Z", testStartsAt: "2025-01-04T00:00:00Z"
  });
  assert.notEqual(first.sha256, second.sha256);
});

test("feature-vector hash uses the same deterministic canonical encoding", () => {
  const first = hashWinMLFeatureVector({ homeForm: 0.6, awayForm: 0.2 });
  const second = hashWinMLProvenance({ awayForm: 0.2, homeForm: 0.6 });
  assert.equal(first.sha256, second.sha256);
});

test("unsupported, undefined, non-finite and cyclic values fail closed", () => {
  assert.throws(() => canonicalizeWinMLProvenance({ value: undefined }), /ml_provenance_undefined_value/);
  assert.throws(() => canonicalizeWinMLProvenance({ value: Number.NaN }), /ml_provenance_non_finite_number/);
  assert.throws(() => canonicalizeWinMLProvenance({ value: new Date() }), /ml_provenance_plain_objects_only/);
  const circular = {};
  circular.self = circular;
  assert.throws(() => canonicalizeWinMLProvenance(circular), /ml_provenance_circular_reference/);
});
