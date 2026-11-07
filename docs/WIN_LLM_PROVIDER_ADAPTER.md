# WIN LLM Provider Adapter

## Purpose

The existing WIN worker execution path now passes through the versioned, provider-neutral LLM request/response contract and the bounded execution policy before an OpenAI Agents SDK call can be made.

The OpenAI adapter is deliberately narrow. It supports text output and optional OpenAI web search. Unsupported structured-output modes and unsupported tool families fail closed; they are not silently ignored.

## Execution path

1. The worker validates its compact prompt and checks the owner-controlled AI spending gate.
2. WIN reserves estimated spend through the existing persistent AI budget ledger.
3. The worker builds a `win.llm.v1` request containing task/agent identity, provider allowlist, model, capabilities, data classification, output limits, tool limits, timeout and reservation reference.
4. Provider selection checks enabled/approved status, verified pricing, allowed data classification, capabilities and model compatibility.
5. The OpenAI adapter calls the existing Agents SDK runner with the selected model, the request's output-token cap, the cooperative cancellation signal and only the requested web-search tool.
6. The Agents SDK is configured with `store: false`; automatic trace export remains disabled.
7. The execution wrapper validates provider identity, approved model, response contract and actual output-token usage.
8. Known usage is settled from SDK usage; uncertain outcomes retain the reservation estimate. No automatic replay is attempted.

## Limits and caveats

- The 90-second timeout bounds WIN's wait and sends an AbortSignal into the Agents SDK. Cancellation is cooperative; do not assume every external tool operation is forcibly stopped.
- The SDK receives the requested maximum output-token setting. WIN also checks the returned usage. The application's estimated budget is not a provider-enforced hard billing cap.
- Web-search calls are measured and checked against the request limit after the SDK run. This is an overrun detector and accounting safeguard, not a guarantee that the provider cannot execute an extra call. Provider-side spend limits and alerts remain required.
- The adapter currently supports text output and optional web search only. Structured output, arbitrary function tools, other providers and fallback are not enabled by this adapter.
- The adapter does not create, promote or validate specialist agents. Agent hierarchy and research assignments remain controlled by WIN's orchestration layer.
- ML training remains a separate pipeline. An LLM-generated narrative is not a trained model prediction or quantitative probability.

## Spending and deployment safety

- `WIN_AI_BUDGET_APPROVED` remains owner-controlled and must remain false until provider-side monthly limits and alerts, auto-recharge settings and API-key rotation have been checked and the owner explicitly approves AI spending.
- No API key is stored in source or included in test fixtures as a real credential.
- Tests use a synthetic runner and make no provider network calls.
- This work remains on the draft development PR. No production deployment, merge, provider activation, budget unlock or paid call is authorized by these changes.
