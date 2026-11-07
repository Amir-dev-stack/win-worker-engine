import { runWinAgent, type WinAgentRun } from "./agents-sdk.mts";
import {
  WIN_LLM_CONTRACT_VERSION,
  type WinLLMProviderAdapter,
  type WinLLMRequestV1,
  type WinLLMResponseV1
} from "./llm-contract.mts";

type AgentRunner = (input: {
  name: string;
  instructions: string;
  prompt: string;
  model: string;
  apiKey: string;
  webSearch: boolean;
  maxTurns?: number;
  maxOutputTokens: number;
  maxToolCallsPerResponse: number;
  signal?: AbortSignal;
}) => Promise<WinAgentRun>;

function failed(request: WinLLMRequestV1, model: string, code: string, latencyMs: number): WinLLMResponseV1 {
  return {
    contractVersion: WIN_LLM_CONTRACT_VERSION,
    requestId: request.requestId,
    providerId: "openai",
    model,
    status: "failed",
    output: "",
    citations: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs,
    error: { category: "permanent", code }
  };
}

function citationsFromResponses(responses: any[]): Array<{ title?: string; url: string }> {
  const citations: Array<{ title?: string; url: string }> = [];
  for (const response of responses) {
    for (const item of response.output ?? []) {
      for (const part of item.content ?? []) {
        for (const annotation of part.annotations ?? []) {
          if (annotation.type === "url_citation" && typeof annotation.url === "string") {
            citations.push({ title: annotation.title, url: annotation.url });
          }
        }
      }
      if (item.type === "web_search_call") {
        for (const source of item.action?.sources ?? item.results ?? []) {
          const url = source.url ?? source.source_website_url;
          if (typeof url === "string") citations.push({ title: source.title, url });
        }
      }
    }
  }
  return [...new Map(citations.map(item => [item.url, item])).values()];
}

/**
 * Provider adapter for WIN's existing OpenAI Agents SDK execution path.
 * It intentionally supports text and optional web search only; unsupported
 * output formats or tool families fail closed instead of being silently ignored.
 */
export function createOpenAIWinLLMAdapter(input: {
  apiKey: string;
  model: string;
  runAgent?: AgentRunner;
}): WinLLMProviderAdapter {
  const runner = input.runAgent ?? runWinAgent;
  return {
    providerId: "openai",
    async execute(request, signal) {
      const startedAt = Date.now();
      if (request.output.format !== "text") {
        return failed(request, input.model, "openai_adapter_text_output_only", 0);
      }
      if (request.tools.some(tool => tool !== "web_search")) {
        return failed(request, input.model, "openai_adapter_tool_not_supported", 0);
      }
      if (request.providerPolicy.model && request.providerPolicy.model !== input.model) {
        return failed(request, input.model, "openai_adapter_model_policy_mismatch", 0);
      }
      if (signal?.aborted) throw new Error("WIN OpenAI request was aborted before execution.");
      const memoryContext = input.memoryContextProvider\n        ? await input.memoryContextProvider(request.agentId)\n        : undefined;\n      const result = await runner({
        name: "WIN " + request.agentId,
        instructions: request.prompt.instructions,
        prompt: request.prompt.input,\n        memoryContext,
        model: input.model,
        apiKey: input.apiKey,
        webSearch: request.tools.includes("web_search"),
        maxTurns: Math.max(1, Math.min(2, request.limits.maxToolCalls + 1)),
        maxOutputTokens: request.limits.maxOutputTokens,
        maxToolCallsPerResponse: Math.ceil(request.limits.maxToolCalls / 2),
        signal
      });
      const latencyMs = Math.max(0, Date.now() - startedAt);
      const usage = {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        billableUnits: { web_search_requests: result.webSearchRequests }
      };
      if (result.webSearchRequests > request.limits.maxToolCalls) {
        return {
          ...failed(request, input.model, "openai_adapter_tool_call_limit_exceeded", latencyMs),
          usage
        };
      }
      return {
        contractVersion: WIN_LLM_CONTRACT_VERSION,
        requestId: request.requestId,
        providerId: "openai",
        model: input.model,
        status: "completed",
        output: result.finalOutput,
        citations: citationsFromResponses(result.rawResponses),
        usage,
        latencyMs,
        responseId: result.responseId
      };
    }
  };
}
