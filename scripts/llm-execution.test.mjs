import test from "node:test";
import assert from "node:assert/strict";
import { executeWinLLMWithPolicy } from "../netlify/lib/llm-execution.mts";
import { WIN_LLM_CONTRACT_VERSION } from "../netlify/lib/llm-contract.mts";

const request = (overrides = {}) => ({
  contractVersion: WIN_LLM_CONTRACT_VERSION, requestId: "exec-test-1", taskId: "task-1", runId: "run-1", agentId: "research-agent",
  providerPolicy: { allowedProviders: ["fake"], preferredProvider: "fake", requiredCapabilities: ["text"] },
  prompt: { instructions: "Use supplied evidence.", input: "Synthetic test." }, output: { format: "text" }, tools: [],
  limits: { maxOutputTokens: 200, maxToolCalls: 0, timeoutMs: 100 }, privacy: { classification: "internal", allowProviderRetention: false },
  budget: { reservationId: "budget-reservation-1", reservedUsd: 0.01 }, ...overrides
});
const descriptor = { id: "fake", enabled: true, approved: true, pricingVerified: true, capabilities: ["text"], allowedClassifications: ["internal"], models: ["fake-model"], priority: 1 };
const success = input => ({
  contractVersion: WIN_LLM_CONTRACT_VERSION, requestId: input.requestId, providerId: "fake", model: "fake-model",
  status: "completed", output: "synthetic result", citations: [], usage: { inputTokens: 10, outputTokens: 5 },
  latencyMs: 2, responseId: "response-1"
});
const run = adapter => executeWinLLMWithPolicy({ request: request(), providers: [descriptor], adapters: [adapter] });

test("execution selects approved provider and validates its response", async () => {
  const result = await run({ providerId: "fake", async execute(input) { return success(input); } });
  assert.equal(result.response.status, "completed");
  assert.deepEqual(result.validationErrors, []);
  assert.equal(result.retryPermitted, false);
});

test("provider timeout aborts adapter and is classified as uncertain without retry", async () => {
  let observedSignal;
  const result = await executeWinLLMWithPolicy({
    request: request({ limits: { maxOutputTokens: 200, maxToolCalls: 0, timeoutMs: 10 } }),
    providers: [descriptor],
    adapters: [{ providerId: "fake", execute(_input, signal) {
      observedSignal = signal;
      return new Promise(() => {});
    } }]
  });
  assert.equal(observedSignal.aborted, true);
  assert.equal(result.timedOut, true);
  assert.equal(result.response.error.category, "uncertain");
  assert.equal(result.retryPermitted, false);
});

test("provider exceptions are uncertain and never trigger an automatic replay", async () => {
  const result = await run({ providerId: "fake", async execute() { throw new Error("connection lost after submit"); } });
  assert.equal(result.response.error.category, "uncertain");
  assert.equal(result.retryPermitted, false);
});

test("invalid provider responses fail closed", async () => {
  const result = await run({ providerId: "fake", async execute(input) {
    return { ...success(input), providerId: "other-provider" };
  } });
  assert.equal(result.response.status, "failed");
  assert.equal(result.response.error.code, "provider_response_validation_failed");
  assert.ok(result.validationErrors.includes("response_provider_mismatch"));
  assert.equal(result.retryPermitted, false);
});

test("missing approved adapter does not call an arbitrary provider", async () => {
  let called = false;
  const result = await executeWinLLMWithPolicy({ request: request(), providers: [descriptor], adapters: [] });
  called = result.response.error.code === "approved_provider_adapter_missing";
  assert.equal(called, true);
  assert.equal(result.response.status, "failed");
});
