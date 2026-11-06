import { Agent, run, setDefaultOpenAIKey, setTracingDisabled, webSearchTool } from "@openai/agents";

export function buildWinAgentModelSettings(maxOutputTokens: number, maxToolCallsPerResponse: number) {
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 ||
      !Number.isSafeInteger(maxToolCallsPerResponse) || maxToolCallsPerResponse < 1) {
    throw new Error("WIN Agents SDK token and tool-call limits must be positive safe integers.");
  }
  return {
    store: false,
    maxTokens: maxOutputTokens,
    parallelToolCalls: false,
    providerData: { max_tool_calls: maxToolCallsPerResponse }
  };
}

export type WinAgentRun = {
  finalOutput: string;
  responseId?: string;
  usage: { input_tokens: number; output_tokens: number };
  webSearchRequests: number;
  rawResponses: any[];
};

export async function runWinAgent(input: {
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
}): Promise<WinAgentRun> {
  // Netlify exposes secrets through Netlify.env rather than relying on process.env.
  // Configure the SDK per invocation so warm function instances never need a hard-coded key.
  setDefaultOpenAIKey(input.apiKey);

  // WIN keeps source material in its own library. Disable automatic trace export
  // until the owner explicitly opts into exporting prompts and tool traces.
  setTracingDisabled(true);

  const tools = input.webSearch ? [webSearchTool({ searchContextSize: "low" as const })] : [];
  const agent = new Agent({
    name: input.name,
    instructions: input.instructions,
    model: input.model,
    modelSettings: buildWinAgentModelSettings(input.maxOutputTokens, input.maxToolCallsPerResponse),
    tools
  });

  const result: any = await run(agent, input.prompt, {
    maxTurns: Math.max(1, Math.min(2, input.maxTurns ?? 2)),
    signal: input.signal
  });

  const output = typeof result.finalOutput === "string"
    ? result.finalOutput
    : result.finalOutput == null ? "" : JSON.stringify(result.finalOutput);
  if (!output.trim()) throw new Error("OpenAI Agents SDK completed without a final text output.");

  const usage = result.state?.usage ?? result.runContext?.usage ?? {};
  const rawResponses = Array.isArray(result.rawResponses) ? result.rawResponses : [];
  const webSearchRequests = rawResponses.reduce((total: number, response: any) =>
    total + (response.output ?? []).filter((item: any) => item.type === "web_search_call").length, 0);

  return {
    finalOutput: output,
    responseId: rawResponses.length ? rawResponses[rawResponses.length - 1]?.id : undefined,
    usage: {
      input_tokens: Number(usage.inputTokens ?? 0),
      output_tokens: Number(usage.outputTokens ?? 0)
    },
    webSearchRequests,
    rawResponses
  };
}
