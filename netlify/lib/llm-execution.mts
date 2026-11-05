import {
  selectWinLLMProvider,
  validateWinLLMRequest,
  validateWinLLMResponse,
  type WinLLMProviderDescriptor,
  type WinLLMProviderAdapter,
  type WinLLMRequestV1,
  type WinLLMResponseV1
} from "./llm-contract.mts";

export type WinLLMExecutionResult = {
  providerId: string;
  response: WinLLMResponseV1;
  timedOut: boolean;
  validationErrors: string[];
  retryPermitted: boolean;
};

function failedResponse(request: WinLLMRequestV1, providerId: string, category: "retryable" | "permanent" | "uncertain", code: string, latencyMs: number): WinLLMResponseV1 {
  return {
    contractVersion: "win.llm.v1",
    requestId: request.requestId,
    providerId,
    model: request.providerPolicy.model || "unknown",
    status: "failed",
    output: "",
    citations: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs,
    error: { category, code }
  };
}

/**
 * Executes one provider attempt under a caller-created budget reservation.
 * A timeout aborts cooperative adapters and is treated as an uncertain outcome:
 * do not blindly replay the same paid request or claim that no provider charge occurred.
 */
export async function executeWinLLMWithPolicy(input: {
  request: WinLLMRequestV1;
  providers: WinLLMProviderDescriptor[];
  adapters: WinLLMProviderAdapter[];
}): Promise<WinLLMExecutionResult> {
  const requestErrors = validateWinLLMRequest(input.request);
  if (requestErrors.length) {
    const response = failedResponse(input.request, "none", "permanent", "request_validation_failed", 0);
    return { providerId: "none", response, timedOut: false, validationErrors: requestErrors, retryPermitted: false };
  }
  const selected = selectWinLLMProvider(input.request, input.providers);
  if (!selected) {
    const response = failedResponse(input.request, "none", "permanent", "no_eligible_provider", 0);
    return { providerId: "none", response, timedOut: false, validationErrors: [], retryPermitted: false };
  }
  const adapter = input.adapters.find(candidate => candidate.providerId === selected.id);
  if (!adapter) {
    const response = failedResponse(input.request, selected.id, "permanent", "approved_provider_adapter_missing", 0);
    return { providerId: selected.id, response, timedOut: false, validationErrors: [], retryPermitted: false };
  }

  const controller = new AbortController();
  const started = Date.now();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<WinLLMResponseV1>(resolve => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("WIN provider execution timed out"));
      resolve(failedResponse(input.request, selected.id, "uncertain", "provider_timeout_outcome_uncertain", Date.now() - started));
    }, input.request.limits.timeoutMs);
  });

  try {
    const execution = Promise.resolve().then(() => adapter.execute(input.request, controller.signal));
    const response = await Promise.race([execution, timeout]);
    const validationErrors = validateWinLLMResponse(input.request, response, selected.id);
    const valid = validationErrors.length === 0;
    return {
      providerId: selected.id,
      response: valid ? response : failedResponse(input.request, selected.id, "permanent", "provider_response_validation_failed", Date.now() - started),
      timedOut,
      validationErrors,
      retryPermitted: valid && response.status === "failed" && response.error?.category === "retryable"
    };
  } catch {
    const response = failedResponse(input.request, selected.id, "uncertain", "provider_execution_outcome_uncertain", Date.now() - started);
    return { providerId: selected.id, response, timedOut: false, validationErrors: [], retryPermitted: false };
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}
