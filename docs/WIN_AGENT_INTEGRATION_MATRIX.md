# WIN Agent Integration Matrix — staged deployment

Status: **draft / not activated**. This is the next layer above PR #29's pure policy and the tested one-shot bridge in PR #28.

## Existing external accounts, confirmed read-only on 2026-11-08

- GitHub: `Amir-dev-stack/win-worker-engine`, **private**. Coordination and audited draft PRs. No project visibility changes.
- Netlify: an existing `win-worker-engine` project. This integration was located, **not** modified or deployed.
- Neon: an existing `win-memory` project. This integration was located, **not** modified or queried for sensitive records.
- Local OpenCode + Ollama: owner verified `ollama/qwen3.5:4b`, `ollama/qwen2.5-coder:7b`, `ollama/llama3.2:3b` are visible; actual inference was successfully tested using `qwen2.5-coder:7b`. No evidence of an always-running local worker.

## Local workers: minimal integration, no new frameworks

`scripts/win-local-agent-router.mjs` provides a deterministic, side-effect-free *proposal* function. Its available model/role combinations:

| Role | Model | Work |
| --- | --- | --- |
| research_extraction | ollama/qwen3.5:4b | Evidence extraction, summaries |
| research_code_review | ollama/qwen2.5-coder:7b | Review offline code samples and fixtures |
| research_summary | ollama/llama3.2:3b | Summarize independently reviewed artifacts |

Roles are logical **configurations**, not three permanently executing processes. A request must have approved R1–R8 research assignment metadata, separate reviewer identity, zero dollar budget, allowlisted action and tools denied; role selection does **not** itself authorize execution.

Do not guess each R1–R8 division's subject area; map them using the existing authoritative assignment docs after review.

## Why we are not installing LangGraph, CrewAI, AutoGen, OpenRouter or more cloud providers yet

WIN already has a research assignment manager, owner/reviewer approval, leases, a local runner and testable GitHub relay. Adding another orchestration framework now would risk competing state machines and increased failure surface. Framework integration should only follow a measured need and an independent package/security/license assessment.

Cloud model catalogs can include billable services even when a model is labeled free. The current no-paid design never selects them; no cloud credentials should be injected into local worker processes.

## Implementation gates

1. Run focused policy/router tests and full local verification in an isolated clean worktree; record exact results.
2. Build an offline fixture task with structured output schema, hashes, bounded input, evidence references and independent review.
3. Validate the existing research assignment manager's approval, claim, lease, reviewer and artifact interfaces with the new router; **do not** duplicate the store.
4. Only then wire a single exact owner-authorized task envelope to the local OpenCode tool-denied runner, with idempotence, timeout and no direct GitHub comment-as-prompt execution.
5. Keep lightweight Netlify scheduling and database durability as a **separate** architecture review: no service is automatically 24/7 merely because an account exists. A cloud cron cannot supply local GPU/CPU capacity while the PC is off.
6. Compare additional agent providers only if they solve a verified capability gap with hard no-cost guarantees and clear data/privacy restrictions.

## Boundary

No payment methods, subscriptions, cloud upgrade, hosted LLM activation, public mirror, unlimited GitHub polling, production deploy, merges, destructive DB writes, or source uploads to external model providers. Any review finding is a draft proposal until validated.
