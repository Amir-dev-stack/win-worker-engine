/**
 * Offline cloud-first model planning only. No calls, credentials, CLI dispatch or billing.
 * An explicit per-provider, per-model no-charge entitlement must be verified in
 * addition to the existing WIN LLM provider descriptor and request guards.
 */
import {
  selectWinLLMProvider, validateWinLLMRequest,
  type WinLLMProviderDescriptor, type WinLLMRequestV1
} from "./llm-contract.mts";

export type WinCloudModelEntitlement = {
  providerId: string;
  model: string;
  confirmedNoCharge: true;
  verifiedAt: string;
  expiresAt: string;
  source: string;
  supportsOffPc: true;
};

export type WinCloudModelPlan =
  | { status: "ready_for_separately_authorized_test"; providerId: string; model: string; requestId: string }
  | { status: "blocked"; reason: string; requestId: string };

const validTimestamp = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * A successful plan never grants execution permission.
 * Always require a separately authorized provider request and remote host.
 */
export function planWinCloudModel(
  request: WinLLMRequestV1,
  providers: WinLLMProviderDescriptor[],
  entitlements: WinCloudModelEntitlement[],
  now: string
): WinCloudModelPlan {
  const requestId = text(request?.requestId) ? request.requestId : "unverified";
  const blocked = (reason: string): WinCloudModelPlan => ({ status: "blocked", reason, requestId });
  if (validateWinLLMRequest(request).length) return blocked("invalid_llm_request");
  if (!validTimestamp(now)) return blocked("audit_clock_invalid");
  if (request.budget.reservedUsd !== 0) return blocked("nonzero_budget_forbidden");
  if (request.providerPolicy.allowedProviders.length !== 1) return blocked("single_provider_required");
  if (!text(request.providerPolicy.model)) return blocked("explicit_model_required");
  const provider = selectWinLLMProvider(request, providers);
  if (!provider) return blocked("approved_eligible_provider_unavailable");
  if (!Array.isArray(entitlements)) return blocked("entitlement_evidence_missing");
  const matching = entitlements.filter(item => item &&
    item.providerId === provider.id && item.model === request.providerPolicy.model);
  // Conflicting or duplicate evidence is ambiguous, never pick a favorable one.
  if (matching.length !== 1) return blocked("unique_entitlement_required");
  const grant = matching[0];
  if (grant.confirmedNoCharge !== true || grant.supportsOffPc !== true ||
      !text(grant.source) || !validTimestamp(grant.verifiedAt) ||
      !validTimestamp(grant.expiresAt)) return blocked("entitlement_unverified");
  const current = Date.parse(now), start = Date.parse(grant.verifiedAt), end = Date.parse(grant.expiresAt);
  if (start > current || end <= current || end <= start) return blocked("entitlement_expired_or_future");
  return {
    status: "ready_for_separately_authorized_test",
    providerId: provider.id, model: request.providerPolicy.model!, requestId
  };
}
