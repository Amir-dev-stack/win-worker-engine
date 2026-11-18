/**
 * Cloudflare Workers AI offline codec. Pure functions only: no fetch, API keys,
 * credentials, account IDs, network calls or deployment capabilities.
 * A generated preview is NOT authorization to dispatch a real inference call.
 */
import {
  selectWinLLMProvider, validateWinLLMRequest,
  type WinLLMProviderDescriptor, type WinLLMRequestV1
} from "./llm-contract.mts";

export const WIN_CLOUDFLARE_PROVIDER = "cloudflare-workers-ai";
export const WIN_CLOUDFLARE_FREE_CANDIDATES = Object.freeze([
  "@cf/zai-org/glm-4.7-flash",
  "@cf/google/gemma-4-26b-a4b-it"
] as const);

export type WinCloudflarePermit = {
  providerId: typeof WIN_CLOUDFLARE_PROVIDER;
  model: string;
  ownerApproved: true;
  freeAccountVerified: true;
  freeModelVerified: true;
  quotaTelemetryVerified: true;
  pricingVerified: true;
  privacyAndRetentionReviewed: true;
  verifiedAt: string;
  expiresAt: string;
};
export type WinCloudflarePreview =
  | { status: "blocked"; reason: string }
  | { status: "simulation_only"; method: "POST"; urlTemplate: string;
      model: string; body: { prompt: string; max_tokens: number } };

const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

/** Build a preview with an account-id PLACEHOLDER, deliberately unusable as live HTTP. */
export function planWinCloudflarePreview(
  request: WinLLMRequestV1,
  providers: WinLLMProviderDescriptor[],
  permit: WinCloudflarePermit | null,
  now: string
): WinCloudflarePreview {
  const blocked = (reason: string): WinCloudflarePreview => ({ status: "blocked", reason });
  if (validateWinLLMRequest(request).length) return blocked("invalid_request");
  if (!isTimestamp(now)) return blocked("clock_unverified");
  if (request.budget.reservedUsd !== 0) return blocked("nonzero_budget_forbidden");
  if (request.privacy.classification !== "public" ||
      request.privacy.allowProviderRetention !== false) return blocked("privacy_not_approved");
  if (request.tools.length || request.output.format !== "text" ||
      request.providerPolicy.requiredCapabilities.some(x => x !== "text"))
    return blocked("unsupported_capability");
  if (request.providerPolicy.allowedProviders.length !== 1 ||
      request.providerPolicy.allowedProviders[0] !== WIN_CLOUDFLARE_PROVIDER ||
      request.providerPolicy.preferredProvider !== WIN_CLOUDFLARE_PROVIDER)
    return blocked("cloudflare_only_required");
  const model = request.providerPolicy.model;
  if (typeof model !== "string" ||
      !(WIN_CLOUDFLARE_FREE_CANDIDATES as readonly string[]).includes(model))
    return blocked("model_not_allowlisted");
  const provider = selectWinLLMProvider(request, providers);
  if (!provider || provider.id !== WIN_CLOUDFLARE_PROVIDER)
    return blocked("verified_provider_unavailable");
  if (!permit || permit.providerId !== WIN_CLOUDFLARE_PROVIDER ||
      permit.model !== model ||
      permit.ownerApproved !== true || permit.freeAccountVerified !== true ||
      permit.freeModelVerified !== true || permit.quotaTelemetryVerified !== true ||
      permit.pricingVerified !== true || permit.privacyAndRetentionReviewed !== true ||
      !isTimestamp(permit.verifiedAt) || !isTimestamp(permit.expiresAt) ||
      Date.parse(permit.verifiedAt) > Date.parse(now) ||
      Date.parse(permit.expiresAt) <= Date.parse(now))
    return blocked("account_entitlement_unverified");
  // Never construct a token, live Account ID or executable authorization header.
  return { status: "simulation_only", method: "POST",
    urlTemplate: "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID_REQUIRED/ai/run/" + model,
    model, body: {
      prompt: request.prompt.instructions + "\n\n" + request.prompt.input,
      max_tokens: request.limits.maxOutputTokens
    }
  };
}

/** Safe response classification: no provider error text, tokens or raw logs emitted. */
export function classifyWinCloudflareResult(payload: unknown, httpStatus: number):
  | { status: "completed"; output: string }
  | { status: "failed"; code: string } {
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 300)
    return { status: "failed", code: httpStatus === 429 ? "provider_rate_limited" :
      httpStatus === 401 || httpStatus === 403 ? "provider_not_authorized" : "provider_http_failure" };
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return { status: "failed", code: "provider_response_malformed" };
  const p = payload as Record<string, unknown>;
  if (p.success !== true || !p.result || typeof p.result !== "object" || Array.isArray(p.result))
    return { status: "failed", code: "provider_response_invalid" };
  const output = (p.result as Record<string, unknown>).response;
  if (typeof output !== "string" || !output.trim())
    return { status: "failed", code: "provider_response_invalid" };
  if (output.length > 40000) return { status: "failed", code: "provider_response_too_large" };
  return { status: "completed", output };
}
