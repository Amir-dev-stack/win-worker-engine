import {
  selectWinLLMProvider,
  validateWinLLMRequest,
  validateWinLLMResponse,
  type WinLLMProviderDescriptor,
  type WinLLMProviderAdapter,
  type WinLLMRequestV1,
  type WinLLMResponseV1
} from "./llm-contract.mts";

/**
 * Runs one asynchronous operation with cooperative cancellation and a hard
 * caller-side wait bound. A timed-out operation may still be active if it
 * ignores AbortSignal; callers must treat its external outcome as uncertain.
 */
export async function executeWithAbortTimeout<T>(
  execute: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new Error("WIN execution timeout must be a positive finite number.");
  }
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>(resolve => {
    timeoutHandle = setTimeout(() => {
      controller.abort(new Error("WIN asynchronous operation timed out"));
      resolve({ timedOut: true });
    }, timeoutMs);
  });
  try {
    const execution = Promise.resolve()
      .then(() => execute(controller.signal))
      .then(value => ({ timedOut: false as const, value }));
    return await Promise.race([execution, timeout]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

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
    if (response?.status === "completed" && !selected.models.includes(response.model)) validationErrors.push("response_model_not_approved");
    if (response && response.usage?.outputTokens > input.request.limits.maxOutputTokens) {
      validationErrors.push("response_output_token_limit_exceeded");
    }
    const valid = validationErrors.length === 0;
    return {
      providerId: selected.id,
      response: valid ? response : failedResponse(input.request, selected.id, "permanent", "provider_response_validation_failed", Date.now() - started),
      timedOut,
      validationErrors,
      retryPermitted: valid && response.status === "failed" && response.error?.category === "retryable"
    };
  } catch {
    const code = timedOut ? "provider_timeout_outcome_uncertain" : "provider_execution_outcome_uncertain";
    const response = failedResponse(input.request, selected.id, "uncertain", code, Date.now() - started);
    return { providerId: selected.id, response, timedOut, validationErrors: [], retryPermitted: false };
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}
