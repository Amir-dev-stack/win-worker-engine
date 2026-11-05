import test from "node:test";
import assert from "node:assert/strict";
import {
  WIN_LLM_CONTRACT_VERSION,
  selectWinLLMProvider,
  validateWinLLMRequest,
  validateWinLLMResponse
} from "../netlify/lib/llm-contract.mts";

function request(overrides = {}) {
  return {
    contractVersion: WIN_LLM_CONTRACT_VERSION,
    requestId: "request-test-1",
    taskId: "task-test-1",
    runId: "run-test-1",
    agentId: "football-research",
    providerPolicy: {
      allowedProviders: ["fake-primary", "fake-fallback"],
      preferredProvider: "fake-primary",
      requiredCapabilities: ["text", "structured_output"]
    },
    prompt: { instructions: "Research using only supplied evidence.", input: "Synthetic test input." },
    output: { format: "json", schemaVersion: "win.test.v1" },
    tools: [],
    limits: { maxOutputTokens: 1200, maxToolCalls: 0, timeoutMs: 15000 },
    privacy: { classification: "internal", allowProviderRetention: false },
    budget: { reservationId: "reservation-test-1", reservedUsd: 0.02 },
    ...overrides
  };
}

function provider(overrides = {}) {
  return {
    id: "fake-primary",
    enabled: true,
    approved: true,
    pricingVerified: true,
    capabilities: ["text", "structured_output"],
    allowedClassifications: ["public", "internal"],
    models: ["fake-model-v1"],
    priority: 10,
    ...overrides
  };
}

test("provider-neutral LLM contract validates policy, routing and fake adapter responses", async () => {
  const validRequest = request();
  assert.deepEqual(validateWinLLMRequest(validRequest), []);

  const invalidRequest = request({
    providerPolicy: {
      allowedProviders: ["fake-fallback"],
      preferredProvider: "fake-primary",
      requiredCapabilities: ["text"]
    }
  });
  assert.ok(validateWinLLMRequest(invalidRequest).includes("preferred_provider_must_be_allowlisted"));

  const noBudget = request({ budget: { reservationId: "", reservedUsd: 0 } });
  assert.ok(validateWinLLMRequest(noBudget).includes("positive_budget_reservation_required"));

  const candidates = [
    provider({ id: "fake-primary", approved: false, priority: 1 }),
    provider({ id: "fake-fallback", capabilities: ["text"], priority: 2 }),
    provider({ id: "fake-fallback", pricingVerified: false, priority: 3 }),
    provider({ id: "fake-fallback", allowedClassifications: ["public"], priority: 4 }),
    provider({ id: "fake-fallback", priority: 5 })
  ];
  const selected = selectWinLLMProvider(validRequest, candidates);
  assert.equal(selected.id, "fake-fallback",
    "router must reject unapproved, under-capable, unpriced and privacy-incompatible providers");

  const preferred = selectWinLLMProvider(validRequest, [
    provider({ id: "fake-fallback", priority: 1 }),
    provider({ id: "fake-primary", priority: 50 })
  ]);
  assert.equal(preferred.id, "fake-primary", "explicit preference wins among equally eligible providers");

  const fakeAdapter = {
    providerId: selected.id,
    async execute(input) {
      return {
        contractVersion: WIN_LLM_CONTRACT_VERSION,
        requestId: input.requestId,
        providerId: this.providerId,
        model: "fake-model-v1",
        status: "completed",
        output: JSON.stringify({ finding: "synthetic-only" }),
        citations: [{ title: "Synthetic evidence", url: "https://example.test/evidence" }],
        usage: { inputTokens: 100, outputTokens: 50, billableUnits: { requests: 1 } },
        latencyMs: 12,
        responseId: "fake-response-1"
      };
    }
  };
  const response = await fakeAdapter.execute(validRequest);
  assert.deepEqual(validateWinLLMResponse(validRequest, response, selected.id), []);

  const wrongProvider = { ...response, providerId: "unapproved-provider" };
  assert.ok(validateWinLLMResponse(validRequest, wrongProvider, selected.id).includes("response_provider_mismatch"));

  const negativeUsage = { ...response, usage: { inputTokens: -1, outputTokens: 50 } };
  assert.ok(validateWinLLMResponse(validRequest, negativeUsage, selected.id).includes("response_usage_invalid"));

  const unclassifiedFailure = { ...response, status: "failed", output: "", error: undefined };
  assert.ok(validateWinLLMResponse(validRequest, unclassifiedFailure, selected.id)
    .includes("failed_response_error_classification_required"));

  assert.equal(selectWinLLMProvider(validRequest, [provider({ enabled: false })]), null,
    "disabled providers must never be selected");
});
