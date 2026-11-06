# WIN Stage 1 — architecture and memory audit

Status: active discovery; read-only audit. This document records confirmed findings from the PR #10 combined-preview baseline and defines the safe implementation sequence. It does not authorize production changes, merges, paid services, or data migration.

## Baseline and preservation boundary

- Repository: `Amir-dev-stack/win-worker-engine`.
- Audit baseline: `feature/free-statsbomb-research-integration` at PR #10 head `17dc194392de8ff4458dcd18a036d6dde99f315b`.
- Planning branch: `feature/cloudflare-multicloud-migration-plan`.
- Existing draft PRs #8, #9 and #10 remain separate, open and unmerged.
- Existing Netlify application, dashboard, APIs, MCP, agent hierarchy, data-source adapters, memory, learning, budget controls, backups and safety policies must be preserved.
- No application code, production configuration, production data, provider credentials or deployments were changed during this audit.

## Stage 1 findings — confirmed

### 1. Storage ownership and adapters

- `netlify/lib/store.mts` is the shared key/value abstraction used by a substantial portion of WIN.
- Netlify Blobs is the default backend (`WIN_MEMORY_BACKEND=blobs`) and remains the documented current source of truth.
- Optional modes are `mirror` (Blobs primary, Neon secondary) and `neon` (Neon primary for allowlisted structured-memory keys; Blobs remains primary for non-allowlisted records).
- The adapter exposes JSON set/get/list/delete, append-as-put, atomic single-key `putIfNew`, conditional `putIfMatch`, and ETag-backed `getWithMetadata`.
- Neon is implemented in `netlify/lib/neon-store.mts` using PostgreSQL JSONB records, ETags and parameterized SQL.
- OAuth state and AI-budget accounting use direct Blobs access outside the shared store. Backup, restore, memory status and capacity monitoring also have direct storage access. These paths need an explicit ownership map before any provider change.
- The structured Neon allowlist in `store.mts` contains 23 prefixes. It deliberately excludes raw event/source payloads, but it also does not currently include several collections read by the library/learning observatory, including model-lab datasets, strategy candidates, backtests, human tips and other settlements. Each excluded collection needs an explicit classification; do not expand the allowlist by guesswork.

### 2. Library and collection surface

- `netlify/lib/library.mts` is a central collection registry and legacy-import path.
- It reads many distinct collections: coupons and coupon outcomes, frozen predictions, settled results, agent profiles/observations/tasks/proposals, lessons/reviews, entity profiles, research runs, source discovery, model-lab event/player/market datasets, calibration reports, settlement runs, learning cycles, strategies and backtests.
- The library performs a non-destructive legacy copy from `tips`, `runs`, `predictions` and `results`, guarded by a completion marker.
- The collection registry and Neon mirrored-prefix list are separate definitions. They can drift. A later change should introduce a tested canonical collection ownership registry without silently changing the live storage backend.

### 3. Prediction, result and learning lifecycle

- `netlify/functions/results.mts` requires authentication and accepts only supported result states with HTTPS settlement source and evidence URLs.
- User-submitted results are marked `pending_independent_review`; they are not automatically promoted as independently verified.
- A prediction settlement learning case is written to both `library/lessons` and `library/settlement-learning`, and matching entity profiles receive agent observations.
- The stable learning-case key makes that particular learning write retry-friendly.
- The current result route checks for an existing result by scanning a bounded `results` collection and then writes with ordinary `put`. The check-plus-write is not an atomic uniqueness claim; concurrent submissions need a dedicated idempotency/conditional-write design.
- Result and learning writes span multiple records without a transaction. A partial failure/retry/reconciliation test is required before strengthening this path.
- The learning observatory explicitly reports that several aggregates are computed from bounded recent samples (often 20 records per collection); its overview must not be mistaken for a complete historical performance calculation.
- Independent lesson review is guarded separately. Research-scoped tools must not self-approve lessons.

### 4. Backup, restore and operational health

- Memory status, backfill, restore and capacity routes are authenticated.
- Backfill is restricted to mirror mode, requires explicit confirmation, uses a lock, inventories keys, compares canonical SHA-256 digests and writes a manifest. It does not authorize switching production to Neon.
- Restore is restricted to mirror mode and verifies snapshot metadata, encrypted bytes, AES-256-GCM authentication, decompression, checksum, row count and allowed key prefixes before writing to the Neon replica.
- Capacity monitoring measures Neon database size and table sizes. Netlify Blobs object count is available, but exact Blobs byte usage is not exposed by the list API.
- The Neon capacity panel's default 1 GiB value is a planning baseline, not proof of the account's actual quota.
- Direct Blobs access in backup/restore/status/capacity and the store adapter must be included in future provider-contract and recovery tests.

## Stage 1 issues to verify before application changes

1. Produce a complete inventory of every Blobs store name, prefix, direct read/write call, and the owning route/module.
2. Reconcile the library collection registry, store mirrored-prefix allowlist, backfill allowlist, restore allowlist, backup inventory and Neon schema.
3. Trace all prediction creation/freeze paths and confirm which immutable identifiers, evidence snapshots, timestamps and model versions are preserved.
4. Trace coupon records, user-submitted results, independent settlement review, market-specific settlement and actual-wager records separately.
5. Inspect every scheduled/background job, retry policy, lock, heartbeat and failure recovery path.
6. Inspect model-lab datasets, feature generation, training/evaluation scripts, calibration and backtest chronology. Separate implemented code from placeholder or unvalidated model output.
7. Inspect agent orchestration, sport/competition/market specialist coverage, independent FOR/AGAINST challenges and Master decision gates.
8. Review existing tests and CI coverage. A skipped dashboard-login/anonymous-health smoke test must remain labelled skipped, not passed.
9. Validate no paid provider is required by default and no secret is stored in source or public configuration.

## Confirmed risks and candidate fixes

| Area | Current observation | Safe next step |
|---|---|---|
| Collection ownership | Multiple independently maintained prefix lists | Build one canonical, tested ownership manifest; initially diagnostic only |
| Result idempotency | Bounded list-then-put check can race | Add isolated concurrency and retry tests; design conditional claim/unique key |
| Multi-record learning writes | No transaction across Blob records | Add resumable/reconciliation semantics and fault-injection tests |
| Store ordering | Blobs and Neon listing semantics differ | Define ordering/cursor contract and test both adapters against the same fixtures |
| Mirroring | Primary/secondary writes can partially fail | Add explicit mirror-health/reconciliation reporting; never silently call a partial write complete |
| Performance observatory | Bounded samples | Label sample scope and create separate complete, paginated historical reports where required |
| Backup/restore | Direct Blobs implementation and duplicated prefix allowlist | Keep existing behavior; add isolated round-trip and allowlist-consistency tests |
| Model quality | Presence of a model or prediction route does not prove predictive validity | Require real datasets, chronological validation, calibration and reproducible model registry |
| Provider sprawl | Multiple proposed providers | Add only after workload, free quota, licensing and operational need are measured |

## Staged build plan

### Stage 1 — architecture and memory audit (current)
Deliverables: complete data ownership map, route/job/agent inventory, risk register, test coverage map and a dependency-ordered implementation backlog.

Exit gate: every persistent collection and direct storage path has an identified owner, writer, reader, retention rule and backup/recovery treatment, or is explicitly marked unresolved.

### Stage 2 — shared foundations and contracts
- Define versioned record, source-evidence, prediction, result, settlement, model and agent-run contracts.
- Define one canonical collection ownership manifest and generate/check mirrored, backup and restore allowlists from it where safe.
- Add contract tests for Blobs and Neon adapters: ETags, conditional writes, pagination, ordering, JSON, missing values, consistency and error behavior.
- Add correlation IDs, structured errors, bounded retries, idempotency and health reporting.
- Preserve Blobs as default; do not migrate data.

### Stage 3 — data and scouting quality
- Inventory providers, licensing, coverage, freshness, rate limits and attribution.
- Normalize sport/competition/team/player/event/market identities.
- Add source disagreement, duplicate and missing-data checks.
- Preserve raw provenance and snapshots; never infer unknown kickoff times or unavailable metrics.

### Stage 4 — quantitative and ML engine
- Audit existing statistical/model code before adding another model.
- Establish reproducible feature datasets and strict pre-match temporal cutoffs.
- Start with interpretable baselines (logistic/Poisson) and tree models only where supported by enough data.
- Use chronological train/validation/test splits and walk-forward evaluation.
- Report Brier score, log loss, calibration, sample sizes, market comparison and uncertainty.
- Register model version, features, training window and evaluation artifacts. No placeholder probabilities.

### Stage 5 — agent departments
- Reuse the current worker organization and agent identities.
- Add/complete sport, competition, market, data-quality, quantitative, FOR, AGAINST, risk, learning and Master responsibilities only where missing.
- Give every run shared evidence IDs and a reproducible run ID.
- Treat LLM output as analysis, not a source of statistical truth.

### Stage 6 — risk and integrity
- Test exposure limits, correlation, stale data, source disagreement, model drift and mandatory-evidence gates.
- Design atomic reservations for any manually approved exposure accounting.
- Separate recommendation, manual approval, confirmed wager and settlement.
- Add circuit-breaker and emergency-stop tests; fail closed on mandatory evidence failures.
- No automated bookmaker placement.

### Stage 7 — results, settlement and learning
- Link immutable predictions to market-specific settlement records.
- Add safe idempotent result ingestion, correction workflow and independent review.
- Track recommendations separately from actual confirmed wagers and returns.
- Add fault recovery for partial multi-record writes.
- Promote lessons/models only after independent review and chronological out-of-sample validation.

### Stage 8 — dashboard and reliability
- Expose source freshness, memory health, model quality, agent/job health, risk state, settlement backlog and quota usage.
- Add heartbeat, alerting, dead-letter/retry visibility, backup verification and restore drills.
- Keep reports honest about incomplete, sample-bounded or unverified data.

### Stage 9 — optional infrastructure
- Evaluate Cloudflare, persistent worker hosting, local Ollama or other providers against measured constraints.
- Require free-tier/quota/licensing/security review and isolated load/failure tests.
- No new provider or billable resource by default.

## Implementation policy

- Use isolated feature branches and draft PRs.
- Run targeted tests, full quality gates, function bundling and relevant preview checks.
- Never overwrite user data, run production backfill, change production environment variables, merge PRs or deploy production without explicit approval.
- Keep changes small, reversible and documented.
- Report what was actually tested, what was skipped, what remains unverified and the exact next decision.

## Football-first, all-sports product scope (2026-11-06)

WIN's product scope includes all sports in its registered sport catalogue. Football is the first complete implementation and end-to-end testing vertical; other sports follow using shared infrastructure with their own sport- and market-specific models and settlement rules.

The canonical football market coverage and acceptance contract is documented in docs/WIN_FOOTBALL_FIRST_MARKET_COVERAGE.md. It includes match results, result combinations, goals, periods, corners, cards, player/team props, Bet Builders, multiples/system products and live/in-play markets where verified source coverage and settlement rules exist.

**Odds policy correction:** no minimum combined odds (including 2.50), no maximum odds, and no forced accumulator format. WIN analyses singles and all supported ticket styles across odds ranges. Odds bands are evaluation cohorts, not blanket selection filters. Unsupported, stale, weakly evidenced or risk-failing cases return NO BET / unavailable.

The current football 1X2 model/evaluation modules are a narrow first vertical, not the complete WIN market contract. Preserve existing v1 artifacts and add a backward-compatible generalized market contract before expanding model outputs and evaluation.

## Human-owned final betting decision (2026-11-06)

This section supersedes any wording elsewhere that implies WIN or its agents automatically reject a requested coupon, enforce a NO BET decision, or make the final betting decision.

- When the user requests a coupon, WIN must generate and present a coupon proposal. Agents must not suppress the requested coupon merely because evidence is incomplete, model confidence is low, odds are unusual, or a risk threshold is exceeded.
- The coupon proposal must distinguish verified evidence, model estimates, assumptions, missing data and unsupported markets. Never fabricate odds, probabilities, event facts, source coverage or settlement terms to make a coupon appear complete.
- For every selection and for the coupon as a whole, agents report an estimated risk percentage only when a defensible calculation is possible, explain the method and uncertainty, and give clear advice. If a defensible percentage cannot be calculated, state 'risk not reliably quantifiable' and explain what is missing; do not invent a number.
- Agents may recommend avoiding a selection or the entire coupon, explain downside scenarios, flag correlation and identify weak evidence. These are recommendations, not execution gates or final decisions.
- The user alone decides whether to place a bet. WIN does not place bets, stake funds or submit bookmaker orders as part of this advisory workflow.
- Keep analytical states separate: model/data eligibility, risk estimate, agent recommendation, coupon proposal status and user decision are distinct fields. A low-confidence or incomplete-evidence proposal remains visible with explicit warnings.
- If a market cannot be verified or priced, show it as unverified/unpriced in the requested proposal and offer a clearly marked alternative where possible. Do not silently omit it or pretend it is supported.
- Coupon generation is mandatory for a requested coupon; automatic bet placement is not authorized.
