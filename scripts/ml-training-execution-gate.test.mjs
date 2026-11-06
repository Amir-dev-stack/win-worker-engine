import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWinMLTrainingExecutionGate } from "../netlify/lib/ml-training-execution-gate.mts";
import { WIN_FOOTBALL_1X2_LOGISTIC_PLAN } from "../netlify/lib/ml-football-experiment-plans.mts";
test("training execution gate fails closed while the server plan keeps fitting disabled", async () => {
  const result = await evaluateWinMLTrainingExecutionGate({ datasetId: "unregistered-dataset", approvalId: "missing-approval", plan: WIN_FOOTBALL_1X2_LOGISTIC_PLAN }, "2026-11-06T12:00:00.000Z");
  assert.equal(result.allowed, false); assert.equal(result.fittingAllowed, false);
  assert.equal(result.productionPromotionAllowed, false); assert.equal(result.automatedBettingAllowed, false);
  assert.ok(result.reasons.includes("experiment_plan_fitting_disabled"));
  assert.ok(result.reasons.includes("server_training_feature_flag_disabled"));
  assert.ok(result.reasons.includes("server_training_execution_approval_missing"));
});
test("training execution gate rejects caller-constructed plans", async () => {
  const result = await evaluateWinMLTrainingExecutionGate({ datasetId: "unregistered-dataset", approvalId: "missing-approval", plan: { ...WIN_FOOTBALL_1X2_LOGISTIC_PLAN, fittingAllowed: true } }, "2026-11-06T12:00:00.000Z");
  assert.equal(result.allowed, false); assert.ok(result.reasons.includes("training_plan_not_server_approved"));
});
