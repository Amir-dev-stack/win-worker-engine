# WIN Autonomous LLM + Machine-Learning Architecture

Date: 2026-11-05  
Status: architecture and implementation contract; no production runtime change.

## 1. Priority and design decision

The primary product capability is WIN's autonomous intelligence: an LLM orchestration system that coordinates specialist agents, tools, evidence, persistent memory and controlled learning, together with a separate statistical/ML system that produces measurable probabilities.

The LLM and ML engines are complementary, not interchangeable:

- **LLM engine:** plans work, delegates tasks, researches sources, extracts structured evidence, explains uncertainty, challenges conclusions, coordinates reviews and proposes improvements.
- **ML engine:** computes reproducible sport/market-specific estimates from versioned historical data, point-in-time features and settled labels.
- **Shared evidence and memory layer:** stores provenance, task history, frozen predictions, outcomes, validated lessons and model artifacts/metadata.
- **Master decision layer:** combines the outputs under explicit evidence, risk, integrity and approval rules.

An LLM must never invent a numerical probability and present it as a trained model output. A statistical model must never treat an LLM narrative as a verified feature or label.

## 2. Existing implementation to preserve

Read-only inspection of the PR #11 development branch found these existing foundations:

| Existing module | Current responsibility | Preservation requirement |
|---|---|---|
| `netlify/lib/ai.mts` | WIN department orchestration, debates and scheduled learning entry points | Keep existing department contracts and handoffs; refactor behind adapters, not a replacement |
| `netlify/lib/agents-sdk.mts` | Agent SDK execution integration | Preserve current provider behavior while adding a stable internal contract |
| `netlify/lib/worker-org.mts` | Sport/competition/event hierarchy and specialist role manifest | Keep sport-specific routing and independent FOR/AGAINST roles |
| `netlify/functions/worker-runner.mts` | Run orchestration, research context, task enqueueing and master decision flow | Keep bounded task graph, auth and run lifecycle |
| `netlify/functions/scheduled-scout-runner.mts` | Budget-gated scheduled learning, queued persistent-agent tasks and proposal evaluation | Keep scheduled work disabled unless explicit environment approval and budget gate both pass |
| `netlify/lib/agent-evolution.mts` | Agent proposals and data-readiness-only sandbox assessment | Preserve proposal-only behavior; no automatic production agent creation or promotion |
| `netlify/lib/ai-budget.mts` | Persistent AI spend ledger, reservations, lock and owner-authorized reset | Mandatory shared gate for every billable LLM provider call |
| `netlify/lib/model-lab.mts` | Historical research pack and an exploratory football frequency baseline | Preserve read-only research role; do not mistake it for a trained feature model |
| `netlify/lib/store.mts` | Netlify Blobs primary store and bounded key/value access | Preserve current ownership until storage migration is separately tested and approved |

This is a source-code inventory, not proof that every provider credential, schedule or live integration is configured or operational.

## 3. Target system boundaries

### A. Autonomous LLM control plane

1. **Master orchestrator** — converts a user objective or scheduled trigger into a bounded, versioned task graph.
2. **Planner** — identifies required evidence, agents, tools, deadlines, token ceilings and budget estimates before execution.
3. **Agent registry** — maps stable agent IDs to role, sport/competition/market scope, allowed tools, prompt version, model policy and validation state.
4. **Task queue and scheduler** — persists task state, leases, attempts, idempotency keys, deadlines, retry ceilings and dead-letter reasons.
5. **Execution runtime** — invokes the selected provider through one adapter contract; supports tool calls only from an allowlist.
6. **Evidence verifier** — checks source URLs, timestamps, source authority, scope, contradictions and structured-output schema.
7. **Independent challenge** — preserves FOR, AGAINST, quantitative and integrity reviews as distinct assignments; disagreement is recorded rather than averaged away.
8. **Memory and knowledge transfer** — retrieves relevant prior cases and stores observations separately from independently validated lessons.
9. **Global Master** — issues recommend / reject / WAIT / NO BET with explicit evidence gaps and decision trace.

### B. LLM provider adapter contract

All providers must sit behind a provider-neutral interface. A provider adapter must expose:

- provider and model identifiers, capability declaration and version;
- structured request and response schema;
- bounded input/output tokens, tool-call count and wall-clock timeout;
- usage/cost metadata where available;
- retryable versus permanent error classification;
- cancellation/timeout behavior;
- safe handling of provider refusal, malformed JSON and partial tool calls;
- request correlation ID and redacted audit metadata.

Provider selection is policy-driven: task capability, data sensitivity, availability, measured quality, latency and approved cost ceiling. A fallback is permitted only if the fallback model meets the task's capability and privacy policy. No silent downgrade may be represented as equivalent quality.

**Budget invariant:** reserve estimated spend before every paid request, settle actual usage afterward, release unused reservation, and fail closed if reservation or spend accounting fails. Existing AI budget settings and locks remain authoritative; adding a provider does not bypass or reset them. Free/local providers still receive rate, concurrency and compute limits.

Provider credentials belong only in encrypted environment secrets or the provider's approved secret manager. Never commit keys, place them in ordinary config, prompts, logs or stored task payloads.

### C. Machine-learning execution plane

Training is a separate, reproducible workload—not a Netlify request handler and not an LLM prompt.

1. **Dataset registry:** immutable dataset ID, source/provider, licence, retrieval time, event-time coverage, schema version, row counts, hashes and permitted use.
2. **Data validation:** identity joins, duplicate detection, missingness, source conflict, coverage, settlement compatibility and freshness.
3. **Point-in-time feature builder:** every feature records when it became knowable; no future lineups, closing prices or post-event facts in an earlier prediction.
4. **Label builder:** market-specific outcomes and operator settlement rules, including void, push, retirement, abandonment and partial settlement.
5. **Experiment runner:** pinned code/dependencies, deterministic seeds, train/validation/holdout manifests and chronological walk-forward folds.
6. **Model families:** sport- and market-specific baselines first; challengers only when data volume and coverage justify them.
7. **Calibration:** fit only from eligible validation predictions; evaluate calibration on later untouched periods.
8. **Model registry:** artifact hash, feature schema, dataset hashes, code version, metrics, limitations, approval state and rollback pointer.
9. **Shadow inference:** compare challenger against the approved champion without influencing user-facing decisions.
10. **Promotion gate:** minimum sample, walk-forward stability, calibration, data support, risk review and recorded human approval.
11. **Monitoring:** drift, feature availability, source changes, calibration decay and failure/rollback signals.

### D. Initial ML sequence

- Football: transparent Logistic Regression and Poisson attack/defence goal model as baselines; derive coherent score/1X2/totals probabilities. CatBoost may be a challenger only when suitable rows and point-in-time features exist.
- Basketball: begin only after match-level team/player features, participation/minutes and reliable availability data exist.
- Tennis: begin only after event identity, surface, player strength, retirement/walkover and settlement labels are reliable.
- Do not pool unrelated sports or markets into one universal model.
- Consensus/closing-price datasets are market benchmarks, not independent performance features and not executable bookmaker prices.

No current audit evidence establishes a production-grade trained WIN model. The current OpenFootball frequency baseline is exploratory; it is not proof of predictive edge.

## 4. Shared contracts and records

Every task, evidence item, model experiment and prediction must carry stable IDs and explicit versions.

Minimum common envelopes:

- `TaskEnvelope`: taskId, parentTaskId, runId, agentId, scope, objective, inputRefs, allowedTools, promptVersion, modelPolicy, budgetReservationId, deadlineAt, attempt, idempotencyKey, status.
- `EvidenceRecord`: evidenceId, entity/event IDs, sport/competition/market, claim or metric, value/unit, source URL, source authority, publishedAt, retrievedAt, validFrom/validTo, freshness TTL, licence, evidence grade, verification status.
- `AgentResult`: taskId, provider/model, prompt/schema version, structured output, citations, tool trace references, token/usage metadata, status, errors, startedAt/completedAt.
- `FeatureSnapshot`: eventId, predictionCutoff, featureSchemaVersion, datasetManifestRefs, feature values, missingness and source timestamps.
- `ModelExperiment`: experimentId, sport/market, dataset and code hashes, folds, parameters, metrics, calibration, limitations and status.
- `FrozenPrediction`: predictionId, event/market, probability distribution, model version, feature snapshot hash, decision time, odds snapshot refs, evidence refs and decision status.
- `OutcomeRecord`: predictionId, settlement rule/version, source/evidence refs, outcome, review status and correction lineage.

Unknown values remain explicitly unknown/null. Do not turn missing data into zero or an LLM guess.

## 5. Autonomy levels and permissions

| Level | Allowed behavior |
|---|---|
| L0 — observe | Read approved sources, inspect memory, report status |
| L1 — research | Create bounded tasks, retrieve public evidence, draft structured findings |
| L2 — sandbox | Run synthetic tests, backtests and candidate model/agent evaluations in isolated storage |
| L3 — propose | Suggest new agents, prompts, models, data sources or policy changes with evidence |
| L4 — approved operation | Execute only specifically approved production actions under existing credentials, budget and risk gates |

Default autonomy for new components is L0–L2. Agent self-modification, new production agents, model promotion, risk-policy changes, new paid services, production data migrations, deployment and automated betting remain prohibited without explicit approval.

Autonomous learning means continuous evidence collection, evaluation, issue detection and proposals. It does not mean agents may rewrite their own permissions or declare their own output validated.

## 6. Reliability, security and governance invariants

- Least-privilege tool permissions per agent; no general-purpose arbitrary network or shell access.
- Treat retrieved pages, files and tool output as untrusted data, never as instructions.
- Enforce source-domain policy, URL validation, redirect limits and SSRF protections in fetch-capable services.
- Validate all LLM structured output with versioned schemas; reject invalid output rather than loosely parsing it.
- Keep task leases, retries and idempotency deterministic; record terminal failures and dead letters.
- Bound concurrency, request size, token use, tool calls, storage reads and compute duration.
- Separate personal data and credentials from model-training datasets and prompts.
- Preserve audit trail for prompt/model/provider changes, task decisions, human approvals and model promotion.
- A failed provider, missing evidence, stale mandatory feature or budget controller error must degrade safely to WAIT / unavailable / NO BET.
- No automated bookmaker bet placement.

## 7. Staged implementation plan

### Stage A — inventory and contracts
- Finish the source inventory for provider calls, prompt versions, tools, agent/task records, model inputs/outputs and spend reservations.
- Define versioned TypeScript contracts and JSON schemas.
- Add deterministic schema/contract tests using synthetic data.
- Map all LLM call paths to the existing budget controller; identify any bypasses before changing runtime.

### Stage B — autonomous LLM reliability
- Introduce provider-neutral adapter around the current Agent SDK integration.
- Add capability-aware routing and explicit fallback policy.
- Add task leases, idempotency, cancellation, retry ceilings and dead-letter reporting.
- Add structured evidence and agent-result validation.
- Test provider timeout, refusal, malformed output, duplicate task, partial completion and budget denial in isolated tests.

### Stage C — memory and learning quality
- Separate raw observations, unverified user-submitted outcomes, reviewed facts and validated lessons.
- Add provenance and time-validity to entity memory.
- Add retrieval relevance, contradiction and staleness checks.
- Ensure agent profiles and prompt evolution are proposals, not automatic production changes.

### Stage D — reproducible ML workspace
- Create an isolated Python workspace with pinned dependencies, deterministic tests and synthetic fixtures.
- Implement dataset manifest and feature/label contracts before fitting models.
- Build football baselines and walk-forward evaluation only when licensed, representative historical records are actually available.
- Persist experiment metadata and artifacts outside latency-sensitive Netlify functions.

### Stage E — shadow evaluation and integration
- Compare challenger model and LLM-assisted research against frozen historical decisions without changing live recommendations.
- Evaluate Brier score, log loss, calibration, coverage and stability; ROI/CLV only with authentic price and settlement provenance.
- Integrate only approved model inference through an authenticated, versioned contract.
- Keep a no-model fallback that explicitly reports unavailable; do not substitute an LLM guess.

### Stage F — measured infrastructure expansion
- Measure actual duration, memory, concurrency, storage, provider cost and cold-start constraints first.
- Keep Netlify for existing application/API responsibilities.
- Add an external worker or Python runtime only if a measured workload cannot be handled safely in the existing stack and a free/approved operating plan exists.
- Do not create duplicate databases or provision paid services by default.

## 8. Immediate engineering priorities

1. Trace `agents-sdk.mts` and every LLM call to verify provider/model selection, token ceilings, tool permissions, timeouts, response parsing and budget reservation/settlement.
2. Build isolated contract tests for the provider adapter and budget fail-closed behavior before runtime refactoring.
3. Trace scheduled and manual task execution end-to-end: enqueue → claim/lease → execute → validate → persist → retry/dead-letter → report.
4. Define ML dataset/feature/label manifests and synthetic tests before introducing Python model dependencies.
5. Keep the existing PR #11 documentation/test branch separate from production; do not merge, deploy, provision services or alter production data as part of this architecture document.

## 9. Explicit non-goals

- No claim that WIN already has a fully autonomous, self-improving production LLM/ML platform.
- No universal LLM-generated probability model.
- No training on unlicensed, unverified or future-leaking data.
- No automatic agent self-promotion or model deployment.
- No new paid provider, subscription, automatic top-up or service dependency without owner approval.
- No automated bookmaker account access or bet placement.
