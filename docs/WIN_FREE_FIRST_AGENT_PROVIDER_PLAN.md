# WIN Free-First Multi-Provider Agent Network

## Owner direction

The owner authorizes WIN to evaluate and integrate additional agent frameworks, model providers, research tools and public data sources when they are genuinely free to operate and sustainable. This supersedes the earlier OpenAI-only restriction. It does not authorize paid upgrades, automatic billing, auto-recharge, paid API fallbacks, or raising the existing WIN spending ceiling.

## Design principle

WIN should be provider-neutral, but not provider-dependent. Keep the existing OpenAI Agents SDK as one supported runtime and add optional adapters behind a common execution contract. A provider is enabled only when its cost is zero under the actual account and selected model, its terms permit the intended use, and a hard quota/stop condition can be enforced.

Do not integrate every available framework. More frameworks create duplicated orchestration, memory, telemetry, security and maintenance work. Keep one WIN assignment manager, one persistent memory system, one artifact format and one review lifecycle. Providers are replaceable execution backends, not separate competing brains.

## Recommended execution tiers

| Tier | Provider/runtime | Intended use | Cost and constraints |
|---|---|---|---|
| 1 | Local Ollama on the owner's PC | Routine drafting, extraction, code review, independent challenge and small experiments | No per-token cloud inference fee for local models; bounded by local hardware, power and uptime. Keep private data local. |
| 2 | Cloudflare Workers AI | Optional cloud fallback for small, non-sensitive tasks | Current Free allocation: 10,000 Neurons/day. Some models require paid billing; only select eligible free models and stop at the daily free allocation. |
| 3 | Google Gemini API Free tier | Optional independent public-source researcher or challenger | Only models explicitly marked free tier; quotas are rate-limited and can change. Free-tier data-use terms may allow prompts/responses to improve Google products, so send public/non-sensitive research only. |
| 4 | OpenAI API | Stronger synthesis, hard research questions and selected specialist tasks | Paid API usage; use only under existing owner-authorized WIN ceiling and per-assignment reservations. Never treat API credits as free or unlimited. |
| 5 | Other free providers (e.g. Groq, Mistral) | Optional later adapters if current account eligibility and terms are verified | Free tiers may be rate-limited, region/model dependent or changed without notice. Do not make core workflows depend on them. |

Hugging Face Inference Providers is not a default production tier: the current free-user allowance is only USD 0.10/month and is subject to change; excess usage is pay-as-you-go. Do not enable billing fallback.

## Local execution and network topology

The user's desktop is the first zero-marginal-cost inference target. Run a small local model through Ollama's localhost OpenAI-compatible endpoint. WIN's cloud backend must not expose the desktop's Ollama port to the public internet. Instead, a local runner should poll/claim approved research assignments over an authenticated outbound HTTPS connection, execute locally, and upload signed/hashed artifacts and structured results. If the desktop is offline, tasks remain queued; no paid provider is silently substituted.

The user's reported machine has 16 GB RAM, an Intel i7 and an AMD GPU. Start with small quantized models and CPU-compatible operation; detect supported GPU acceleration rather than assuming AMD acceleration works on the installed driver/runtime. Benchmark latency, memory and quality before selecting a default model. Do not attempt to load large 30B+ models on this machine as a default.

## Memory and identity

All providers use the same WIN memory contracts:
- private per-agent persistent memory in WIN Blobs;
- shared research memory only after independent review;
- assignment/session IDs, provider/model identity, timestamps, source provenance and artifact hashes;
- bounded memory context and retrieval, with stale-source warnings;
- no provider-specific conversation history as the sole system of record.

An agent's identity is its stable WIN agentId, not the provider account or model name. The same agent can resume on another provider without losing its long-term memory. Provider-specific session IDs are optional execution metadata only.

## Routing policy

1. Deterministic code/statistical models handle numeric evaluation, probabilities, validation and calculations.
2. Local models handle routine, repeatable research tasks first.
3. A free cloud provider may be used only if the account/model is confirmed free and quota remains.
4. OpenAI may be selected for a task requiring stronger reasoning, only after reserving cost against the existing WIN budget.
5. If a provider fails, route only to another provider whose cost and data policy satisfy the task. Otherwise pause and leave the assignment queued.
6. Never route private secrets, personal data, API keys, unpublished credentials or sensitive user data to a free provider with unclear or training-permissive data terms.
7. Every result records provider, model, region if available, cost class, tokens/usage, tool calls, latency, retries, quality score and source list.

## Free and sustainable eligibility gate

Before enabling any provider, verify and record:
- current official pricing and free-tier eligibility for the exact model and tool;
- whether a payment method is required and whether usage can become billable;
- provider data retention/training terms and geographic processing;
- rate limits, daily/monthly quotas and reset timezone;
- a hard local kill switch and usage meter;
- whether the free tier is appropriate for ongoing service, not just a trial credit;
- license and acceptable-use terms for the model and data.

If the service requires a paid plan, payment method with automatic overage, trial credit, or unbounded usage to be reliable, it is not classified as sustainable free infrastructure. Do not enable it as an automatic fallback.

## Framework policy

Keep orchestration lightweight and provider-neutral. The current OpenAI Agents SDK remains supported for OpenAI-native tool/handoff flows. For future self-hosted multi-provider workflows, prefer adding one small framework only if it materially improves resumable workflows or durable orchestration. Candidate OSS frameworks include LangGraph, Pydantic AI, Agno and CrewAI; do not add multiple frameworks just to create more agent names. Framework licenses are free; inference, hosting, storage and monitoring may not be.

## Rollout sequence

1. Keep assignment lifecycle, persistent memory, review and artifact contracts as the shared control plane.
2. Implement a provider adapter contract and local Ollama polling runner; the adapter, token-authenticated endpoint and bounded local runner script are now staged in code. Keep execution disabled until the endpoint is deployed, the owner configures the server-side token/agent allowlist and Ollama is installed locally.
3. Add provider health, quota and usage telemetry plus strict zero-cost mode.
4. Evaluate one Cloudflare Workers AI free model only after verifying the account is on Workers Free; never activate on Workers Paid. Keep the adapter disabled until a quota monitor and model-specific neuron preflight are implemented.
5. Evaluate one Gemini Free-tier model only on a project with billing disabled, using public-only tasks and explicit consent to the free-tier data-use terms.
6. Benchmark all free backends on the same fixed research tasks against quality, latency, reliability, memory use and total marginal cost.
7. Keep OpenAI as a paid escalation route only under the existing owner-authorized ceiling.
8. Only then decide which providers deserve production routing. Remove adapters that are unreliable or not genuinely free.

## Explicit boundaries

No paid subscription, paid inference, automatic overage, auto-recharge, budget reset/increase, production deployment, unattended unlimited agent loop, automatic model/strategy promotion, or bet execution is authorized by this plan. The owner retains control over spend ceilings and final betting decisions.