import type {
  WinLLMProviderAdapter,
  WinLLMProviderDescriptor,
  WinLLMRequestV1,
  WinLLMResponseV1
} from "./llm-contract.mts";
import { WIN_LLM_CONTRACT_VERSION } from "./llm-contract.mts";

type FetchLike = typeof fetch;
type Env = Record<string, string | undefined>;

function failure(request: WinLLMRequestV1, providerId: string, model: string, category: "retryable" | "permanent" | "uncertain", code: string, latencyMs: number): WinLLMResponseV1 {
  return {
    contractVersion: WIN_LLM_CONTRACT_VERSION, requestId: request.requestId, providerId, model,
    status: "failed", output: "", citations: [],
    usage: { inputTokens: 0, outputTokens: 0 }, latencyMs,
    error: { category, code }
  };
}

function classifyHttp(status: number): "retryable" | "permanent" | "uncertain" {
  if (status === 429 || status === 408) return "retryable";
  if (status >= 500) return "uncertain";
  return "permanent";
}

async function readJson(response: Response): Promise<any> {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw new Error("provider_invalid_json_response"); }
}

function validateRequest(request: WinLLMRequestV1, providerId: string, model: string) {
  if (request.output.format !== "text") return "adapter_text_output_only";
  if (request.providerPolicy.model && request.providerPolicy.model !== model) return "adapter_model_policy_mismatch";
  if (request.tools.length) return "adapter_external_tools_not_supported";
  if (request.privacy.classification !== "public" && providerId !== "ollama") return "adapter_public_data_only";
  return null;
}

export function createOllamaWinLLMAdapter(input: {
  model: string; baseUrl?: string; fetchImpl?: FetchLike;
}): WinLLMProviderAdapter {
  const base = (input.baseUrl || "http://127.0.0.1:11434/v1").replace(/\/+$/, "");
  const parsed = new URL(base);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)) {
    throw new Error("Ollama adapter only permits a loopback HTTP endpoint; never expose the local model port publicly.");
  }
  const fetcher = input.fetchImpl || fetch;
  return {
    providerId: "ollama",
    async execute(request, signal) {
      const started = Date.now();
      const invalid = validateRequest(request, "ollama", input.model);
      if (invalid) return failure(request, "ollama", input.model, "permanent", invalid, Date.now() - started);
      if (signal?.aborted) return failure(request, "ollama", input.model, "uncertain", "aborted_before_request", Date.now() - started);
      try {
        const response = await fetcher(base + "/chat/completions", {
          method: "POST", signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: input.model,
            messages: [
              { role: "system", content: request.prompt.instructions },
              { role: "user", content: request.prompt.input }
            ],
            max_tokens: request.limits.maxOutputTokens,
            temperature: 0.2,
            stream: false
          })
        });
        const body = await readJson(response);
        if (!response.ok) return failure(request, "ollama", input.model, classifyHttp(response.status), "ollama_http_" + response.status, Date.now() - started);
        const output = body?.choices?.[0]?.message?.content;
        if (typeof output !== "string" || !output.trim()) return failure(request, "ollama", input.model, "permanent", "ollama_empty_output", Date.now() - started);
        return {
          contractVersion: WIN_LLM_CONTRACT_VERSION, requestId: request.requestId, providerId: "ollama",
          model: typeof body.model === "string" ? body.model : input.model,
          status: "completed", output, citations: [],
          usage: { inputTokens: Number(body.usage?.prompt_tokens || 0), outputTokens: Number(body.usage?.completion_tokens || 0) },
          latencyMs: Date.now() - started, responseId: typeof body.id === "string" ? body.id : undefined
        };
      } catch (error) {
        return failure(request, "ollama", input.model, "uncertain",
          signal?.aborted ? "ollama_timeout_or_abort_outcome_uncertain" : "ollama_transport_outcome_uncertain", Date.now() - started);
      }
    }
  };
}

export function createCloudflareWorkersAIAdapter(input: {
  accountId: string; apiToken: string; model: string; fetchImpl?: FetchLike;
}): WinLLMProviderAdapter {
  const fetcher = input.fetchImpl || fetch;
  return {
    providerId: "cloudflare_workers_ai",
    async execute(request, signal) {
      const started = Date.now();
      const invalid = validateRequest(request, "cloudflare_workers_ai", input.model);
      if (invalid) return failure(request, "cloudflare_workers_ai", input.model, "permanent", invalid, Date.now() - started);
      try {
        const response = await fetcher("https://api.cloudflare.com/client/v4/accounts/" +
          encodeURIComponent(input.accountId) + "/ai/run/" + encodeURI(input.model), {
          method: "POST", signal,
          headers: { authorization: "Bearer " + input.apiToken, "content-type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "system", content: request.prompt.instructions },
              { role: "user", content: request.prompt.input }
            ],
            max_tokens: request.limits.maxOutputTokens
          })
        });
        const body = await readJson(response);
        if (!response.ok || body?.success === false) return failure(request, "cloudflare_workers_ai", input.model,
          classifyHttp(response.status), "cloudflare_http_" + response.status, Date.now() - started);
        const output = body?.result?.response ?? body?.result?.output_text;
        if (typeof output !== "string" || !output.trim()) return failure(request, "cloudflare_workers_ai", input.model, "permanent", "cloudflare_empty_output", Date.now() - started);
        const usage = body?.result?.usage || {};
        return {
          contractVersion: WIN_LLM_CONTRACT_VERSION, requestId: request.requestId, providerId: "cloudflare_workers_ai",
          model: input.model, status: "completed", output, citations: [],
          usage: {
            inputTokens: Number(usage.input_tokens || usage.prompt_tokens || 0),
            outputTokens: Number(usage.output_tokens || usage.completion_tokens || 0),
            billableUnits: { neurons: Number(body?.result?.neurons || usage.neurons || 0), requests: 1 }
          },
          latencyMs: Date.now() - started
        };
      } catch {
        return failure(request, "cloudflare_workers_ai", input.model, "uncertain", "cloudflare_transport_outcome_uncertain", Date.now() - started);
      }
    }
  };
}

export function createGeminiFreeTierAdapter(input: {
  apiKey: string; model: string; fetchImpl?: FetchLike;
}): WinLLMProviderAdapter {
  const fetcher = input.fetchImpl || fetch;
  return {
    providerId: "gemini_free",
    async execute(request, signal) {
      const started = Date.now();
      const invalid = validateRequest(request, "gemini_free", input.model);
      if (invalid) return failure(request, "gemini_free", input.model, "permanent", invalid, Date.now() - started);
      if (request.privacy.allowProviderRetention !== true) {
        return failure(request, "gemini_free", input.model, "permanent", "gemini_free_tier_retention_consent_required", Date.now() - started);
      }
      try {
        const response = await fetcher("https://generativelanguage.googleapis.com/v1beta/models/" +
          encodeURIComponent(input.model) + ":generateContent", {
          method: "POST", signal,
          headers: { "content-type": "application/json", "x-goog-api-key": input.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.prompt.instructions }] },
            contents: [{ role: "user", parts: [{ text: request.prompt.input }] }],
            generationConfig: { maxOutputTokens: request.limits.maxOutputTokens, temperature: 0.2 }
          })
        });
        const body = await readJson(response);
        if (!response.ok) return failure(request, "gemini_free", input.model, classifyHttp(response.status), "gemini_http_" + response.status, Date.now() - started);
        const output = body?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("");
        if (typeof output !== "string" || !output.trim()) return failure(request, "gemini_free", input.model, "permanent", "gemini_empty_output", Date.now() - started);
        const usage = body?.usageMetadata || {};
        return {
          contractVersion: WIN_LLM_CONTRACT_VERSION, requestId: request.requestId, providerId: "gemini_free",
          model: input.model, status: "completed", output, citations: [],
          usage: { inputTokens: Number(usage.promptTokenCount || 0), outputTokens: Number(usage.candidatesTokenCount || 0), billableUnits: { requests: 1 } },
          latencyMs: Date.now() - started
        };
      } catch {
        return failure(request, "gemini_free", input.model, "uncertain", "gemini_transport_outcome_uncertain", Date.now() - started);
      }
    }
  };
}

/** Providers are disabled unless an owner explicitly enables and verifies the exact free model. */
export function buildFreeProviderDescriptors(env: Env): WinLLMProviderDescriptor[] {
  const ollamaModel = env.WIN_OLLAMA_MODEL || "";
  const cfModel = env.WIN_CLOUDFLARE_FREE_MODEL || "";
  const geminiModel = env.WIN_GEMINI_FREE_MODEL || "";
  const ollamaEnabled = env.WIN_ENABLE_OLLAMA_PROVIDER === "true" && !!ollamaModel;
  const cfEnabled = env.WIN_ENABLE_CLOUDFLARE_FREE_PROVIDER === "true" &&
    env.WIN_CLOUDFLARE_WORKERS_FREE_PLAN_CONFIRMED === "true" &&
    env.WIN_CLOUDFLARE_FREE_MODEL_APPROVED === "true" && !!cfModel &&
    !!env.CLOUDFLARE_ACCOUNT_ID && !!env.CLOUDFLARE_API_TOKEN;
  const geminiEnabled = env.WIN_ENABLE_GEMINI_FREE_PROVIDER === "true" &&
    env.WIN_GEMINI_FREE_TIER_CONFIRMED === "true" && env.WIN_GEMINI_BILLING_DISABLED === "true" &&
    env.WIN_GEMINI_FREE_MODEL_APPROVED === "true" && !!geminiModel && !!env.GEMINI_API_KEY;
  return [
    {
      id: "ollama", enabled: ollamaEnabled, approved: ollamaEnabled, pricingVerified: true,
      capabilities: ["text"], allowedClassifications: ["public", "internal"],
      models: ollamaModel ? [ollamaModel] : [], priority: 1
    },
    {
      id: "cloudflare_workers_ai", enabled: cfEnabled, approved: cfEnabled, pricingVerified: cfEnabled,
      capabilities: ["text"], allowedClassifications: ["public"],
      models: cfModel ? [cfModel] : [], quotaVerified: cfEnabled, priority: 2
    },
    {
      id: "gemini_free", enabled: geminiEnabled, approved: geminiEnabled, pricingVerified: geminiEnabled,
      requiresRetentionConsent: true,
      capabilities: ["text"], allowedClassifications: ["public"],
      models: geminiModel ? [geminiModel] : [], quotaVerified: geminiEnabled, priority: 3
    }
  ];
}

export function createConfiguredFreeProviderAdapters(env: Env, fetchImpl?: FetchLike): WinLLMProviderAdapter[] {
  const descriptors = buildFreeProviderDescriptors(env);
  const adapters: WinLLMProviderAdapter[] = [];
  const ollama = descriptors.find(item => item.id === "ollama");
  if (ollama?.enabled) adapters.push(createOllamaWinLLMAdapter({
    model: ollama.models[0], baseUrl: env.WIN_OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1", fetchImpl
  }));
  const cloudflare = descriptors.find(item => item.id === "cloudflare_workers_ai");
  if (cloudflare?.enabled) adapters.push(createCloudflareWorkersAIAdapter({
    accountId: env.CLOUDFLARE_ACCOUNT_ID!, apiToken: env.CLOUDFLARE_API_TOKEN!, model: cloudflare.models[0], fetchImpl
  }));
  const gemini = descriptors.find(item => item.id === "gemini_free");
  if (gemini?.enabled) adapters.push(createGeminiFreeTierAdapter({
    apiKey: env.GEMINI_API_KEY!, model: gemini.models[0], fetchImpl
  }));
  return adapters;
}
