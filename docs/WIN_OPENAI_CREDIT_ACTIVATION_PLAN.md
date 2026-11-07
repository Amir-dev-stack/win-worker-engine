# WIN Provider Activation and OpenAI Credit Safety Plan

## Owner authorization

The owner reports purchasing USD 5.00 of OpenAI API credits and authorizes bounded OpenAI API use for WIN research when needed. The live remaining balance is not verified.

The owner also authorizes additional agent frameworks, model providers, research tools and public data sources when they are genuinely free and sustainable. This includes local Ollama and carefully verified free Cloudflare/Gemini tiers. Free-provider permission does not authorize paid upgrades, overages, auto-recharge or billing fallback.

## Safeguards that remain in force

- Preserve the existing WIN application spending stop of USD 2.95 against the current USD 3 reference cycle. Do not silently raise it to the full USD 5 purchase.
- Preserve the persistent owner lock. Month rollover, a new task, retry, scheduled job or agent handoff must not unlock spending.
- Do not enable automatic recharge or purchase additional credits.
- Do not run a real model call from tests, CI, preview builds or unapproved scheduled jobs.
- Keep API keys in server-side runtime secrets or the local machine's protected environment only. Never place keys in source, browser bundles, public GitHub files, chat, logs or fixtures.
- Keep the existing `WIN_AI_BUDGET_APPROVED` gate fail-closed until the owner verifies provider-side controls and the actual account balance.
- The in-app ledger is an estimate, not a provider-enforced hard billing limit. Preserve the existing provider-side spending limit and owner confirmation requirements.

## Implemented execution paths (staged, not live)

### Local Ollama

- Windows setup helper: `scripts/setup-win-local-ollama.ps1`.
- Local polling runner: `scripts/win-local-agent-runner.mjs`.
- Server endpoint: `/api/research-runner`, protected by a separate high-entropy runner token and server-side agent allowlist.
- Claims only owner-approved assignments with explicit HTTPS source URLs.
- Runs a local model, stores a local artifact and submits it for independent review.
- No cloud inference cost. The local runner has no general web-search engine; it fetches only URLs explicitly included in the assignment.

### OpenAI Agents SDK

- Assignment executor: `netlify/lib/win-research-openai-executor.mts`.
- Owner-gated endpoint: `/api/research-openai-execute`.
- Injects private/shared research memory and runs one bounded learning assignment.
- The task's `budgetCeilingUsd` is compared with the global budget reservation before the provider call. If the reservation exceeds the task ceiling, the reservation is released and the model request is not sent.
- The existing global spending lock, `WIN_AI_BUDGET_APPROVED` gate, token/tool limits and conservative uncertain-outcome settlement remain in force.
- A successful report must include HTTPS citations and is submitted to the untrusted inbox; independent review is required before shared research memory promotion.

### Cloudflare Workers AI and Gemini

- Provider adapters exist in `netlify/lib/llm-free-provider-adapters.mts`.
- They are disabled by default.
- Cloudflare requires explicit confirmation that the account is on the Workers Free plan and the exact model is eligible for free usage.
- Gemini requires explicit confirmation that the project is on the Free tier with billing disabled. Its free-tier data-use terms require public, non-sensitive research and explicit retention consent.
- Do not enable either provider if account billing status, model eligibility or quota enforcement is uncertain.

## Before the first OpenAI run

1. Open the OpenAI API billing/usage dashboard and confirm the actual remaining prepaid balance and project.
2. Confirm the API project has a provider-side spending limit no higher than the owner's chosen ceiling.
3. Configure usage alerts and verify automatic recharge is disabled.
4. Verify the dedicated server-side API key and approved model. Do not paste the key into chat.
5. Review current model pricing and hosted web-search/tool charges.
6. Confirm the existing WIN spending lock and budget ledger state.
7. Enable the OpenAI assignment endpoint only after all checks are complete. Run one short, non-sensitive, owner-approved assignment first.
8. Compare provider dashboard usage with WIN's recorded usage. If cost or outcome is uncertain, stop and do not automatically retry.

## Rollout sequence

1. Deploy the code only when Netlify deploy capacity is available without an unapproved paid upgrade.
2. Install and benchmark Ollama locally; begin with one small task.
3. Configure the dedicated local runner token and agent allowlist.
4. Execute one approved local assignment and independently review it.
5. Verify Cloudflare and Gemini free-tier account status before enabling their adapters.
6. Execute one bounded OpenAI assignment only after the API balance, provider-side controls and WIN owner lock have been checked.
7. Measure cost, latency, evidence quality, accepted artifact rate and quota reliability before expanding.
8. Keep unattended recurring research disabled until quotas, cost accounting and a bounded schedule have been proven.

## Explicit non-goals

No automatic recharge, paid provider fallback, paid plan upgrade, budget reset/increase, production deployment without available deploy credits, automatic strategy/model promotion, unrestricted continuous agent loop or bet placement is authorized. The owner retains final control over spend ceilings, strategy promotion and all betting decisions.
