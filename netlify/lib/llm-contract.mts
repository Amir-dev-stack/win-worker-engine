export const WIN_LLM_CONTRACT_VERSION = "win.llm.v1" as const;

export type WinLLMCapability = "text" | "structured_output" | "web_search" | "function_tools";
export type WinLLMDataClassification = "public" | "internal" | "confidential" | "restricted";

export type WinLLMRequestV1 = {
  contractVersion: typeof WIN_LLM_CONTRACT_VERSION;
  requestId: string;
  taskId: string;
  runId?: string;
  agentId: string;
  providerPolicy: {
    allowedProviders: string[];
    preferredProvider?: string;
    model?: string;
    requiredCapabilities: WinLLMCapability[];
  };
  prompt: { instructions: string; input: string };
  output: { format: "text" | "json"; schemaVersion?: string };
  tools: string[];
  limits: { maxOutputTokens: number; maxToolCalls: number; timeoutMs: number };
  privacy: { classification: WinLLMDataClassification; allowProviderRetention: boolean };
  budget: { reservationId: string; reservedUsd: number };
};

export type WinLLMProviderDescriptor = {
  /** True only when this provider may retain/use submitted prompts under its free-tier terms. */
  requiresRetentionConsent?: boolean;
  /** False means no hard provider-side or local quota boundary has been verified. */
  quotaVerified?: boolean;
  id: string;
  enabled: boolean;
  approved: boolean;
  pricingVerified: boolean;
  capabilities: WinLLMCapability[];
  allowedClassifications: WinLLMDataClassification[];
  models: string[];
  priority: number;
};

export type WinLLMResponseV1 = {
  contractVersion: typeof WIN_LLM_CONTRACT_VERSION;
  requestId: string;
  providerId: string;
  model: string;
  status: "completed" | "failed";
  output: string;
  citations: Array<{ title?: string; url: string }>;
  usage: { inputTokens: number; outputTokens: number; billableUnits?: Record<string, number> };
  latencyMs: number;
  responseId?: string;
  error?: { category: "retryable" | "permanent" | "uncertain"; code: string };
};

export interface WinLLMProviderAdapter {
  readonly providerId: string;
  execute(request: WinLLMRequestV1, signal?: AbortSignal): Promise<WinLLMResponseV1>;
}

const CAPABILITIES = new Set<WinLLMCapability>([
  "text", "structured_output", "web_search", "function_tools"
]);
const CLASSIFICATIONS = new Set<WinLLMDataClassification>([
  "public", "internal", "confidential", "restricted"
]);

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateWinLLMRequest(request: WinLLMRequestV1): string[] {
  const errors: string[] = [];
  if (!request || request.contractVersion !== WIN_LLM_CONTRACT_VERSION) errors.push("unsupported_contract_version");
  if (!nonEmpty(request?.requestId)) errors.push("request_id_required");
  if (!nonEmpty(request?.taskId)) errors.push("task_id_required");
  if (!nonEmpty(request?.agentId)) errors.push("agent_id_required");
  if (!Array.isArray(request?.providerPolicy?.allowedProviders) ||
      request.providerPolicy.allowedProviders.length === 0 ||
      request.providerPolicy.allowedProviders.some(id => !nonEmpty(id))) errors.push("approved_provider_allowlist_required");
  if (request?.providerPolicy?.preferredProvider &&
      !request.providerPolicy.allowedProviders?.includes(request.providerPolicy.preferredProvider)) {
    errors.push("preferred_provider_must_be_allowlisted");
  }
  if (request?.providerPolicy?.model !== undefined && !nonEmpty(request.providerPolicy.model)) errors.push("model_policy_invalid");
  if (!Array.isArray(request?.providerPolicy?.requiredCapabilities) ||
      request.providerPolicy.requiredCapabilities.some(capability => !CAPABILITIES.has(capability))) {
    errors.push("required_capabilities_invalid");
  }
  if (!nonEmpty(request?.prompt?.instructions) || !nonEmpty(request?.prompt?.input)) errors.push("prompt_required");
  if (!request?.output || !["text", "json"].includes(request.output.format)) errors.push("output_format_invalid");
  if (request?.output?.format === "json" && !nonEmpty(request.output.schemaVersion)) errors.push("json_schema_version_required");
  if (!Array.isArray(request?.tools) || request.tools.some(tool => !nonEmpty(tool))) errors.push("tool_allowlist_invalid");
  if (!Number.isInteger(request?.limits?.maxOutputTokens) || request.limits.maxOutputTokens < 1 || request.limits.maxOutputTokens > 32000) errors.push("output_token_limit_invalid");
  if (!Number.isInteger(request?.limits?.maxToolCalls) || request.limits.maxToolCalls < 0 || request.limits.maxToolCalls > 20) errors.push("tool_call_limit_invalid");
  if (!Number.isInteger(request?.limits?.timeoutMs) || request.limits.timeoutMs < 100 || request.limits.timeoutMs > 120000) errors.push("timeout_limit_invalid");
  if (!CLASSIFICATIONS.has(request?.privacy?.classification)) errors.push("data_classification_invalid");
  if (typeof request?.privacy?.allowProviderRetention !== "boolean") errors.push("provider_retention_policy_required");
  if (!nonEmpty(request?.budget?.reservationId) ||
      !Number.isFinite(request?.budget?.reservedUsd) || request.budget.reservedUsd < 0) errors.push("nonnegative_budget_reservation_required");
  const promptSize = (request?.prompt?.instructions?.length || 0) + (request?.prompt?.input?.length || 0);
  if (promptSize > 1_000_000) errors.push("prompt_size_limit_exceeded");
  if (new Set(request?.providerPolicy?.allowedProviders || []).size !== (request?.providerPolicy?.allowedProviders || []).length) {
    errors.push("duplicate_provider_allowlist_entry");
  }
  return errors;
}

/** Selects only an enabled, explicitly approved, priced provider meeting every task and privacy requirement. */
export function selectWinLLMProvider(
  request: WinLLMRequestV1,
  providers: WinLLMProviderDescriptor[]
): WinLLMProviderDescriptor | null {
  if (validateWinLLMRequest(request).length || !Array.isArray(providers)) return null;
  const allowed = new Set(request.providerPolicy.allowedProviders);
  const required = new Set(request.providerPolicy.requiredCapabilities);
  const candidates = providers.filter(provider =>
    provider && allowed.has(provider.id) &&
    provider.enabled === true &&
    provider.approved === true &&
    provider.pricingVerified === true &&
    provider.quotaVerified !== false &&
    Array.isArray(provider.models) &&
    (!request.providerPolicy.model || provider.models.includes(request.providerPolicy.model)) &&
    Array.isArray(provider.capabilities) &&
    [...required].every(capability => provider.capabilities.includes(capability)) &&
    Array.isArray(provider.allowedClassifications) &&
    provider.allowedClassifications.includes(request.privacy.classification) &&
    (!provider.requiresRetentionConsent || request.privacy.allowProviderRetention === true) &&
    Number.isFinite(provider.priority)
  );
  candidates.sort((a, b) =>
    Number(b.id === request.providerPolicy.preferredProvider) -
    Number(a.id === request.providerPolicy.preferredProvider) ||
    a.priority - b.priority ||
    a.id.localeCompare(b.id)
  );
  return candidates[0] || null;
}

export function validateWinLLMResponse(
  request: WinLLMRequestV1,
  response: WinLLMResponseV1,
  expectedProviderId: string
): string[] {
  const errors: string[] = [];
  if (!response || response.contractVersion !== WIN_LLM_CONTRACT_VERSION) errors.push("unsupported_response_contract");
  if (response?.requestId !== request?.requestId) errors.push("response_request_id_mismatch");
  if (response?.providerId !== expectedProviderId) errors.push("response_provider_mismatch");
  if (!nonEmpty(response?.model)) errors.push("response_model_required");
  if (!["completed", "failed"].includes(response?.status)) errors.push("response_status_invalid");
  if (response?.status === "completed" && !nonEmpty(response.output)) errors.push("completed_response_output_required");
  if (response?.status === "failed" && !["retryable", "permanent", "uncertain"].includes(response?.error?.category)) {
    errors.push("failed_response_error_classification_required");
  }
  if (!Number.isFinite(response?.usage?.inputTokens) || response.usage.inputTokens < 0 ||
      !Number.isFinite(response?.usage?.outputTokens) || response.usage.outputTokens < 0) errors.push("response_usage_invalid");
  if (response?.usage?.billableUnits && Object.values(response.usage.billableUnits).some(value => !Number.isFinite(value) || value < 0)) {
    errors.push("response_billable_units_invalid");
  }
  if (!Number.isFinite(response?.latencyMs) || response.latencyMs < 0) errors.push("response_latency_invalid");
  if (!Array.isArray(response?.citations) || response.citations.some(item =>
      !item || !nonEmpty(item.url) || !/^https:\/\//i.test(item.url))) errors.push("response_citations_invalid");
  return errors;
}
