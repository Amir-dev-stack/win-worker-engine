import test from "node:test";
import assert from "node:assert/strict";
import { buildWinAgentModelSettings } from "../netlify/lib/agents-sdk.mts";

test("Agents SDK settings enforce one bounded provider tool cap per turn and disable parallel tools", () => {
  assert.deepEqual(buildWinAgentModelSettings(600, 1), {
    store: false,
    maxTokens: 600,
    parallelToolCalls: false,
    providerData: { max_tool_calls: 1 }
  });
  assert.deepEqual(buildWinAgentModelSettings(1000, 2), {
    store: false,
    maxTokens: 1000,
    parallelToolCalls: false,
    providerData: { max_tool_calls: 2 }
  });
});

test("Agents SDK settings reject invalid token and tool limits", () => {
  assert.throws(() => buildWinAgentModelSettings(0, 1), /positive safe integers/);
  assert.throws(() => buildWinAgentModelSettings(100, 0), /positive safe integers/);
  assert.throws(() => buildWinAgentModelSettings(Number.NaN, 1), /positive safe integers/);
});
