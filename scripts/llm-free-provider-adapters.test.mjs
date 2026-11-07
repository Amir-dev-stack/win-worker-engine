import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFreeProviderDescriptors,
  createCloudflareWorkersAIAdapter,
  createGeminiFreeTierAdapter,
  createOllamaWinLLMAdapter
} from "../netlify/lib/llm-free-provider-adapters.mts";
import { WIN_LLM_CONTRACT_VERSION, selectWinLLMProvider } from "../netlify/lib/llm-contract.mts";

const request = (providerId, model, overrides = {}) => ({
  contractVersion: WIN_LLM_CONTRACT_VERSION, requestId: "free-provider-test", taskId: "task-test",
  agentId: "test-agent",
  providerPolicy: { allowedProviders: [providerId], preferredProvider: providerId, model, requiredCapabilities: ["text"] },
  prompt: { instructions: "Use only supplied public evidence.", input: "Synthetic test input." },
  output: { format: "text" }, tools: [],
  limits: { maxOutputTokens: 128, maxToolCalls: 0, timeoutMs: 1000 },
  privacy: { classification: "public", allowProviderRetention: false },
  budget: { reservationId: "free-reservation", reservedUsd: 0 },
  ...overrides
});

test("free providers are disabled by default and require exact owner opt-in", () => {
  const defaults = buildFreeProviderDescriptors({});
  assert.ok(defaults.every(provider => !provider.enabled && !provider.approved));
  const enabled = buildFreeProviderDescriptors({
    WIN_ENABLE_OLLAMA_PROVIDER: "true", WIN_OLLAMA_MODEL: "qwen2.5:3b",
    WIN_ENABLE_CLOUDFLARE_FREE_PROVIDER: "true", WIN_CLOUDFLARE_FREE_MODEL_APPROVED: "true",
    WIN_CLOUDFLARE_FREE_MODEL: "@cf/example/free-model", CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_API_TOKEN: "token",
    WIN_ENABLE_GEMINI_FREE_PROVIDER: "true", WIN_GEMINI_FREE_MODEL_APPROVED: "true",
    WIN_GEMINI_FREE_MODEL: "gemini-example-free", GEMINI_API_KEY: "secret"
  });
  assert.deepEqual(enabled.map(provider => provider.enabled), [true, true, true]);
  assert.equal(enabled[2].requiresRetentionConsent, true);
  assert.deepEqual(enabled[1].allowedClassifications, ["public"]);
});

test("provider selection blocks Gemini free tier unless retention is explicitly allowed", () => {
  const gemini = buildFreeProviderDescriptors({
    WIN_ENABLE_GEMINI_FREE_PROVIDER: "true", WIN_GEMINI_FREE_MODEL_APPROVED: "true",
    WIN_GEMINI_FREE_MODEL: "gemini-example-free", GEMINI_API_KEY: "secret"
  })[2];
  assert.equal(selectWinLLMProvider(request("gemini_free", "gemini-example-free"), [gemini]), null);
  const consented = request("gemini_free", "gemini-example-free", {
    privacy: { classification: "public", allowProviderRetention: true }
  });
  assert.equal(selectWinLLMProvider(consented, [gemini]).id, "gemini_free");
});

test("Ollama adapter only accepts loopback addresses", () => {
  assert.throws(() => createOllamaWinLLMAdapter({
    model: "qwen2.5:3b", baseUrl: "http://0.0.0.0:11434/v1"
  }), /loopback/);
  assert.throws(() => createOllamaWinLLMAdapter({
    model: "qwen2.5:3b", baseUrl: "https://remote.example/v1"
  }), /loopback/);
});

test("Ollama adapter maps local OpenAI-compatible chat responses", async () => {
  let calledUrl = "";
  const adapter = createOllamaWinLLMAdapter({
    model: "qwen2.5:3b",
    fetchImpl: async (url, init) => {
      calledUrl = String(url);
      const body = JSON.parse(init.body);
      assert.equal(body.messages[0].role, "system");
      assert.equal(body.max_tokens, 128);
      return new Response(JSON.stringify({
        model: "qwen2.5:3b", id: "local-response",
        choices: [{ message: { content: "Synthetic local result." } }],
        usage: { prompt_tokens: 20, completion_tokens: 8 }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const result = await adapter.execute(request("ollama", "qwen2.5:3b"));
  assert.equal(calledUrl, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(result.status, "completed");
  assert.equal(result.output, "Synthetic local result.");
  assert.equal(result.usage.inputTokens, 20);
});

test("Cloudflare adapter sends credentials in headers and reports observed neuron usage", async () => {
  let headers;
  const adapter = createCloudflareWorkersAIAdapter({
    accountId: "account-123", apiToken: "secret-token", model: "@cf/example/free-model",
    fetchImpl: async (url, init) => {
      assert.match(String(url), /accounts\/account-123\/ai\/run/);
      headers = init.headers;
      return new Response(JSON.stringify({
        success: true, result: { response: "Synthetic CF result.", neurons: 42, usage: { input_tokens: 10, output_tokens: 4 } }
      }), { status: 200 });
    }
  });
  const result = await adapter.execute(request("cloudflare_workers_ai", "@cf/example/free-model"));
  assert.equal(headers.authorization, "Bearer secret-token");
  assert.equal(result.status, "completed");
  assert.equal(result.usage.billableUnits.neurons, 42);
});

test("Gemini adapter requires explicit free-tier retention consent", async () => {
  let calls = 0;
  const adapter = createGeminiFreeTierAdapter({
    apiKey: "test-key", model: "gemini-example-free",
    fetchImpl: async (_url, init) => {
      calls += 1;
      assert.equal(init.headers["x-goog-api-key"], "test-key");
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Synthetic Gemini result." }] } }],
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5 }
      }), { status: 200 });
    }
  });
  const blocked = await adapter.execute(request("gemini_free", "gemini-example-free"));
  assert.equal(blocked.status, "failed");
  assert.equal(blocked.error.code, "gemini_free_tier_retention_consent_required");
  assert.equal(calls, 0);
  const allowed = await adapter.execute(request("gemini_free", "gemini-example-free", {
    privacy: { classification: "public", allowProviderRetention: true }
  }));
  assert.equal(allowed.status, "completed");
  assert.equal(allowed.usage.inputTokens, 11);
  assert.equal(calls, 1);
});

test("provider HTTP errors never return a fabricated success", async () => {
  const adapter = createOllamaWinLLMAdapter({
    model: "qwen2.5:3b",
    fetchImpl: async () => new Response("rate limited", { status: 429 })
  });
  const result = await adapter.execute(request("ollama", "qwen2.5:3b"));
  assert.equal(result.status, "failed");
  assert.equal(result.error.category, "retryable");
});
