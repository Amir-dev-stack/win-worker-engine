import { evaluateWinMLTrainingReadiness } from "./ml-owner-approval-registry.mts";
import { WIN_FOOTBALL_1X2_LOGISTIC_PLAN, type WinMLExperimentPlan } from "./ml-football-experiment-plans.mts";
function protectedEnv(name: string): string {
  try { return Netlify.env.get(name) || ""; } catch { return ""; }
}
export type WinMLTrainingExecutionRequest = { datasetId: string; approvalId: string; plan: WinMLExperimentPlan };
/** Server-side gate; no request may provide feature flags, trusted keys or reviewer identity. */
export async function evaluateWinMLTrainingExecutionGate(request: WinMLTrainingExecutionRequest, now = new Date().toISOString()) {
  const reasons: string[] = [];
  if (request?.plan !== WIN_FOOTBALL_1X2_LOGISTIC_PLAN) reasons.push("training_plan_not_server_approved");
  if (request?.plan?.fittingAllowed !== true) reasons.push("experiment_plan_fitting_disabled");
  if (protectedEnv("WIN_ML_FITTING_ENABLED") !== "true") reasons.push("server_training_feature_flag_disabled");
  if (protectedEnv("WIN_ML_EXECUTION_APPROVED") !== "true") reasons.push("server_training_execution_approval_missing");
  if (reasons.length) return {
    allowed: false as const, reasons, datasetId: request?.datasetId || null, approvalId: request?.approvalId || null,
    evidenceReady: false, fittingAllowed: false as const, productionPromotionAllowed: false as const, automatedBettingAllowed: false as const
  };
  const publicKeyPem = protectedEnv("WIN_ML_OWNER_APPROVAL_PUBLIC_KEY");
  const reviewerId = protectedEnv("WIN_ML_OWNER_REVIEWER_ID");
  if (!publicKeyPem.trim() || !reviewerId.trim()) return {
    allowed: false as const, reasons: ["owner_approval_control_plane_not_configured"],
    datasetId: request.datasetId, approvalId: request.approvalId, evidenceReady: false,
    fittingAllowed: false as const, productionPromotionAllowed: false as const, automatedBettingAllowed: false as const
  };
  const readiness = await evaluateWinMLTrainingReadiness(request.datasetId, request.approvalId, { publicKeyPem, reviewerId }, now);
  return {
    allowed: false as const,
    reasons: readiness.evidenceReady ? ["training_execution_requires_separate_reviewed_release"] : readiness.reasons,
    datasetId: readiness.datasetId, approvalId: readiness.approvalId, evidenceReady: readiness.evidenceReady,
    fittingAllowed: false as const, productionPromotionAllowed: false as const, automatedBettingAllowed: false as const
  };
}
