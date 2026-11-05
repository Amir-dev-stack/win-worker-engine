import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAIWinLLMAdapter } from "../netlify/lib/agents-sdk-adapter.mts";
import { WIN_LLM_CONTRACT_VERSION } from "../netlify/lib/llm-contract.mts";

const request = (overrides = {}) => ({
  contractVersion: WIN_LLM_CONTRACT_VERSION,
  requestId: "adapter-test-1",
  taskId: "task-1",
  runId: "run-1",
  agentId: "research-agent",
  providerPolicy: {
    allowedProviders: ["openai"],
    preferredProvider: "openai",
    model: "approved-model",
    requiredCapabilities: ["text", "web_search"]
  },
  prompt: { instructions: "Research carefully.", input: "Synthetic test input." },
  output: { format: "text" },
  tools: ["web_search"],
  limits: { maxOutputTokens: 200, maxToolCalls: 1, timeoutMs: 1000 },
  privacy: { classification: "internal", allowProviderRetention: false },
  budget: { reservationId: "reservation-1", reservedUsd: 0.01 },
  ...overrides
});
const agentResult = {
  finalOutput: "Synthetic research report",
  responseId: "resp-123",
  usage: { input_tokens: 100, output_tokens: 40 },
  webSearchRequests: 1,
  rawResponses: [{
    output: [
      { content: [{ annotations: [{ type: "url_citation", title: "Source A", url: "https://example.com/a" }] }] },
      { type: "web_search_call", action: { sources: [{ title: "Source B", url: "https://example.com/b" }] } }
    ]
  }]
};

test("OpenAI adapter maps Agents SDK output, citations, usage and cancellation signal", async () => {
  let received;
  const controller = new AbortController();
  const adapter = createOpenAIWinLLMAdapter({
    apiKey: "synthetic-test-key",
    model: "approved-model",
    async runAgent(input) { received = input; return agentResult; }
  });
  const response = await adapter.execute(request(), controller.signal);
  assert.equal(received.signal, controller.signal);
  assert.equal(received.apiKey, "synthetic-test-key");
  assert.equal(received.webSearch, true);
  assert.equal(response.status, "completed");
  assert.equal(response.providerId, "openai");
  assert.equal(response.model, "approved-model");
  assert.equal(response.output, "Synthetic research report");
  assert.equal(response.responseId, "resp-123");
  assert.deepEqual(response.usage, {
    inputTokens: 100,
    outputTokens: 40,
    billableUnits: { web_search_requests: 1 }
  });
  assert.deepEqual(response.citations, [
    { title: "Source A", url: "https://example.com/a" },
    { title: "Source B", url: "https://example.com/b" }
  ]);
});

test("OpenAI adapter fails closed for unsupported structured output", async () => {
  let called = false;
  const adapter = createOpenAIWinLLMAdapter({
    apiKey: "synthetic-test-key",
    model: "approved-model",
    async runAgent() { called = true; return agentResult; }
  });
  const response = await adapter.execute(request({ output: { format: "json" } }));
  assert.equal(called, false);
  assert.equal(response.status, "failed");
  assert.equal(response.error.code, "openai_adapter_text_output_only");
});

test("OpenAI adapter fails closed for unsupported tool families", async () => {
  let called = false;
  const adapter = createOpenAIWinLLMAdapter({
    apiKey: "synthetic-test-key",
    model: "approved-model",
    async runAgent() { called = true; return agentResult; }
  });
  const response = await adapter.execute(request({ tools: ["database_write"] }));
  assert.equal(called, false);
  assert.equal(response.status, "failed");
  assert.equal(response.error.code, "openai_adapter_tool_not_supported");
});

test("OpenAI adapter fails closed when model policy differs from configured model", async () => {
  let called = false;
  const adapter = createOpenAIWinLLMAdapter({
    apiKey: "synthetic-test-key",
    model: "approved-model",
    async runAgent() { called = true; return agentResult; }
  });
  const response = await adapter.execute(request({
    providerPolicy: { allowedProviders: ["openai"], preferredProvider: "openai", model: "other-model", requiredCapabilities: ["text"] }
  }));
  assert.equal(called, false);
  assert.equal(response.status, "failed");
  assert.equal(response.error.code, "openai_adapter_model_policy_mismatch");
});

test("OpenAI adapter rejects web-search usage above the request tool-call limit", async () => {
  const adapter = createOpenAIWinLLMAdapter({
    apiKey: "synthetic-test-key",
    model: "approved-model",
    async runAgent() { return { ...agentResult, webSearchRequests: 2 }; }
  });
  const response = await adapter.execute(request({
    limits: { maxOutputTokens: 200, maxToolCalls: 1, timeoutMs: 1000 }
  }));
  assert.equal(response.status, "failed");
  assert.equal(response.error.code, "openai_adapter_tool_call_limit_exceeded");
  assert.deepEqual(response.usage, {
    inputTokens: 100,
    outputTokens: 40,
    billableUnits: { web_search_requests: 2 }
  });
});

test("OpenAI adapter does not invoke the SDK after cancellation", async () => {
  let called = false;
  const controller = new AbortController();
  controller.abort();
  const adapter = createOpenAIWinLLMAdapter({
    apiKey: "synthetic-test-key",
    model: "approved-model",
    async runAgent() { called = true; return agentResult; }
  });
  await assert.rejects(adapter.execute(request(), controller.signal), /aborted before execution/);
  assert.equal(called, false);
});
