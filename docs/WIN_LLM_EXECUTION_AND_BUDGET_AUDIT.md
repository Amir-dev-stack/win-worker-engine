# WIN LLM execution and budget audit

Date: 2026-11-05  
Branch reviewed: `docs/win-staged-build-roadmap`  
Scope: read-only source inspection; no provider calls, credentials, production settings or data changed.

## 1. Current LLM execution path

The current primary LLM path is OpenAI-only:

`worker-runner / scheduled-scout-runner` → `netlify/lib/ai.mts` → `netlify/lib/agents-sdk.mts` → `@openai/agents`.

Observed behavior:

- `ai.mts` reads `OPENAI_API_KEY` and `OPENAI_MODEL` from Netlify runtime secrets.
- Missing key/model returns a failed worker report before making a request.
- Requests are disabled unless `WIN_AI_BUDGET_APPROVED=true`.
- `WIN_ENABLE_WEB_SEARCH` controls use of the Agents SDK web-search tool; default in source is enabled unless explicitly set to false.
- Scheduled scout/learning requests use lower output and tool-call ceilings than interactive work.
- The current worker call reserves a budget before calling the SDK, settles reported token/search usage after success, and attempts uncertain settlement on error.
- The SDK adapter configures the key per invocation, disables automatic trace export, and caps the Agents SDK run at two turns.
- Agent output is returned with response ID, token usage and extracted citations.

This is a useful working foundation, but it is not yet a provider-neutral multi-LLM runtime.

## 2. Existing budget controller

`netlify/lib/ai-budget.mts` provides:

- a persistent monthly ledger in the `win-engine` Blobs namespace;
- a controller lock using strong reads and conditional ETag writes;
- pre-request reservations and post-request settlement;
- model-specific price entries and explicit blocking when no price policy exists;
- a $3 reference budget and $2.95 internal operating stop;
- persistent spending lock and owner-authorized unlock/archive flow;
- alerts and blocked-call accounting.

Important distinction: the code itself explicitly describes the Blobs ledger as an estimate, not a provider-enforced hard cap. The request path also explicitly requires the owner to configure provider-side spending controls, usage alerts, disable auto-recharge and rotate the API key before enabling AI execution. Do not bypass that gate or claim that the internal estimate alone guarantees a hard provider billing cap.

The current model price table is explicit and finite. Any new model/provider must have a verified rate/cost policy before requests are permitted. Unknown pricing must fail closed.

## 3. Gaps before autonomous multi-provider execution

1. **Provider abstraction:** the worker path directly depends on OpenAI environment variables and the OpenAI Agents SDK. There is no demonstrated common adapter contract or provider router in this branch.
2. **Capability-aware routing:** no verified registry yet maps each provider/model to structured output, tool use, context length, privacy constraints, latency and cost.
3. **Fallback semantics:** no demonstrated safe fallback policy that preserves task capability and quality; a failed model must not silently downgrade the task.
4. **Tool governance:** web search is a single optional tool in the inspected adapter. A per-agent allowlist, tool schemas, tool-call audit and network safety contract need to be made explicit before adding tools/providers.
5. **Timeout/cancellation/retries:** the inspected SDK adapter caps turns, but the full provider call timeout, cancellation, retry and idempotency behavior needs end-to-end verification.
6. **Structured output validation:** current downstream runners parse tagged JSON blocks from narrative text. This needs versioned schema validation, size limits and explicit invalid-output handling before outputs can drive state changes.
7. **Task leases and concurrency:** persistent task queues exist, but complete lease/claim atomicity and duplicate execution behavior need contract tests.
8. **Usage accounting:** provider usage fields can differ. The adapter must normalize usage, price units and uncertainty; when usage is unavailable, preserve the reservation or conservatively settle it rather than releasing it as free.
9. **Observability/privacy:** SDK trace export is disabled, which is a deliberate privacy-preserving default. Add internal redacted operational metadata without storing secrets or unnecessarily exporting full prompts/tool traces.
10. **Budget scope:** every provider call, embedding, reranker, search or auxiliary model call must be mapped to a cost/compute policy. No secondary provider may bypass the central budget gate.

## 4. Required provider-neutral contract

A provider adapter should accept a versioned request containing:

- request/task/run/agent IDs;
- provider/model policy and required capabilities;
- system instructions and user input;
- structured output schema/version;
- explicitly permitted tools;
- input/output token limits, tool-call limit, timeout and cancellation signal;
- privacy/data-classification policy;
- budget reservation reference.

It should return:

- provider/model actually used;
- validated structured result and/or text;
- citations and tool-call references;
- normalized input/output usage and any other billable units;
- latency, response ID and finish status;
- retryable/permanent/uncertain error classification;
- prompt, schema and adapter versions.

The router must select only an approved model that meets the required capabilities and privacy classification. It must reserve cost before invocation and settle actual or conservative usage afterward. If the budget ledger, price policy, provider credentials or schema validation is unavailable, fail closed.

## 5. Next safe implementation steps

1. Add tests around the existing AI budget controller using a synthetic adapter/store, covering reservation contention, unknown model pricing, spending lock, owner unlock guard, successful usage settlement and uncertain settlement.
2. Add an LLM call-path inventory for all direct provider/SDK invocations and confirm every path passes through the budget gate.
3. Define provider-neutral TypeScript types and schema validation without changing the current OpenAI runtime.
4. Add an adapter contract test suite using fake providers only; no real API calls or secrets.
5. Refactor the existing OpenAI SDK wrapper behind the contract only after characterization tests pass.
6. Add another provider only when its free/approved access, data handling, tool capabilities and verified cost policy are known.

## 6. Safety boundary

This audit does not authorize setting `WIN_AI_BUDGET_APPROVED`, adding provider credentials, changing provider-side limits, enabling auto-recharge, unlocking the spending ledger, adding a paid provider, changing Netlify settings or making production calls. Those actions remain owner-controlled.
