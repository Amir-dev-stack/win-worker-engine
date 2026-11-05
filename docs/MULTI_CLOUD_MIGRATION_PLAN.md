# WIN multi-cloud migration plan

Status: discovery and planning only. This document does not authorize production changes.

## Owner requirements

- Preserve every existing WIN capability, record, workflow, integration, dashboard surface, MCP tool, safety gate and learning process.
- Keep the initial operating cost at zero. Do not enable paid plans, paid AI APIs, credit auto-recharge or billable resources without explicit owner approval.
- Connect providers through explicit, authenticated service contracts and one authoritative data model.
- Build and validate a parallel environment before any production cutover.
- Keep the current Netlify deployment and data stores as a fallback until the owner approves a verified cutover.
- Do not merge existing draft PRs, alter production, run destructive SQL, delete data, or make a production schema change without explicit approval.

## Audited repository baseline

Repository: `Amir-dev-stack/win-worker-engine` (private)
Default branch: `main`
Migration planning branch base: PR #10 head `17dc194392de8ff4458dcd18a036d6dde99f315b`.

The PR #10 head is deliberately used as the planning baseline because it contains the combined preview of still-unmerged PR #8, PR #9 and PR #10 work. PRs #8, #9 and #10 remain separate, open and draft; none is merged by this plan.

At the PR #10 head, the repository contains:
- 53 Netlify Functions.
- 1 Netlify Edge Function.
- 41 `netlify/lib` modules.
- A static dashboard in `public/`.
- GitHub Actions validation workflows.
- Tests, data-source adapters and architecture documentation.
- A Neon SQL migration and an optional Neon storage adapter.

The current platform configuration uses Node.js 22, Netlify Functions, Netlify Edge Functions, Netlify Blobs and the Netlify build/runtime APIs. The package also includes the MCP SDK, Zod, OpenAI Agents SDK and Neon serverless driver. The current build script and tests explicitly validate the Netlify implementation.

## Existing functional areas to preserve

1. Dashboard, secure dashboard session and owner authentication.
2. OAuth authorization server, PKCE, token issuance/refresh and scoped MCP access.
3. MCP read, audit and research tools.
4. Multi-department research orchestration, sport/country/competition/team/player/event agent identities, FOR/AGAINST challenge and Global Master decision.
5. Coupon research, predictions, frozen prediction records, results and settlement evidence.
6. Learning, observatory, scheduled research gates, agent task queue, lesson review and persistent entity memory.
7. Human coupon imports and settlement review.
8. Historical simulation and chronological strategy backtesting.
9. Evidence coverage, public-source discovery and source governance.
10. Sport registries, market catalogues, calibration and match evidence.
11. Existing sports-data adapters and research-only integrations, including nflverse, API-Football, OpenFootball, StatsBomb Open Data, SportScore and SkillCorner.
12. Monitoring, health, AI budget lock, post-match checks, backups and recovery.
13. Existing safety boundaries: no automated bet placement, no unverified outcome promotion, and fail-closed NO BET behaviour when mandatory evidence is missing.

The inventory above is a preservation checklist, not a claim that every external provider credential or live source is currently configured or validated.

## Current persistence and data status

- Netlify Blobs is documented as the current production source of truth for WIN's general key/value library.
- Neon project `win-memory` exists in AWS EU Central 1.
- The Neon migration tables exist on the default `production` branch: `win_memory_records`, `win_financial_accounts` and `win_financial_ledger`.
- Read-only row counts on the default production branch at audit time were zero for all three tables.
- A separate Neon branch named `win-memory-schema-test` contains one financial-account row and one ledger row; these appear to be test data and must not be treated as production WIN records.
- Therefore, the Neon schema is present, but the production structured-memory backfill/cutover is not evidenced by the current database contents. Do not switch the live storage backend based only on a successful connection.
- No existing Blobs data was read, copied, modified or deleted during this audit.

Before any data migration, export and inventory every Blobs collection, compare exact key sets and canonical hashes, verify record counts, and test restoration. Keep source records intact.

## Target provider roles (proposed, not provisioned)

### Cloudflare
- Pages: static dashboard delivery.
- Workers: lightweight APIs, routing, authentication middleware, cache and request coordination.
- Queues / scheduled Workers: bounded asynchronous jobs only where the execution and quota model fits.
- R2: optional object storage only after its free allowance, egress, lifecycle and recovery characteristics are verified.
- Cloudflare services must not become a second source of truth for the same relational records.

### Oracle Cloud Always Free (conditional)
- Candidate for a persistent Node.js service or heavier background worker if the account is eligible and suitable capacity is actually available.
- Treat free capacity as best-effort, not guaranteed. Confirm regional capacity, account eligibility, support/SLA limits, backup requirements and inactivity/termination policies before relying on it.
- Do not expose internal services directly to the public internet without authenticated ingress.

### Neon
- Retain PostgreSQL as the single authoritative relational database for structured WIN memory after a verified migration and explicit approval.
- Keep one canonical schema and clear migration process.
- Do not introduce Supabase or another database merely to duplicate Neon functionality.

### Local AI
- Ollama on the owner's Windows PC is the first candidate for zero-API-cost model inference.
- The currently reported hardware is 16 GB RAM, AMD GPU and Intel Core i7; exact CPU/GPU/VRAM model is still unknown.
- Local inference is available only while the PC is online and capable. Cloud services must queue or defer local-model tasks when it is offline; do not make the whole WIN service depend on the home PC.
- Do not expose Ollama publicly. Any remote connection must use authenticated private networking/tunnelling, strict access controls and request limits.

### Optional providers
- Deno Deploy, Supabase, Vercel and Render are not automatic additions. Add a provider only for a measured requirement, a clear free-tier fit and an independently tested failure boundary.
- Do not distribute the same workload across providers just to evade quotas or provider terms.

## Connectivity and security contract

- GitHub remains the source of truth; all deployments must be reproducible from version-controlled commits.
- Every service-to-service call uses a documented API contract, authenticated identity, least-privilege credentials, timeouts, retries with idempotency, request tracing and bounded payloads.
- Secrets stay in provider secret stores; never commit secrets or send them to browser code, logs or chat.
- Neon credentials are server-side only. Use pooled connections where appropriate and keep schema migrations explicit.
- Preserve OAuth issuer/resource identity and registered redirect URI behaviour during migration. OAuth tokens, PKCE, refresh rotation, MCP scopes and dashboard sessions require dedicated compatibility/security tests.
- Use one authoritative record store. During transition, use explicit dual-write/read-compare only where the existing adapter supports it, with reconciliation and visible failure handling.
- Use append-only settlement and learning history; never edit frozen prediction snapshots when recording results.
- Monitoring must report provider health, quota/usage, latency, errors, queue depth, data freshness and backup age. Quota exhaustion must fail safely and must not trigger automatic paid upgrades.

## Migration phases and acceptance gates

### Phase 0 — inventory (in progress)
- Complete route/function, dependency, environment-variable-name, scheduled-job, storage-collection, MCP tool, dashboard, workflow and external-provider inventory.
- Classify each function by runtime needs: static, edge-compatible, short request, background/long-running, scheduled, database-heavy or provider-specific.
- Identify Netlify-only APIs and Node.js dependencies that require an adapter or service relocation.
- Record the current deploy/PR baseline and preserve all draft branches.

### Phase 1 — compatibility design
- Produce a route-by-route and function-by-function target mapping.
- Decide which lightweight functions can run on Workers and which require a Node.js-compatible persistent/worker runtime.
- Define the common service API, authentication, queue contract, data ownership, observability and failure behaviour.
- Confirm free-tier limits and legal terms immediately before using each provider.

### Phase 2 — parallel non-production foundation
- Create a separate migration branch and isolated preview resources only after free-tier eligibility is confirmed.
- Add Cloudflare configuration without replacing or deleting Netlify configuration.
- Build one representative health endpoint and one read-only data path first.
- Use synthetic/test data and a separate Neon test branch for compatibility tests.
- Do not point preview services at production write paths.

### Phase 3 — full feature parity
- Port all 53 functions, the Edge Function and required library/runtime behaviour.
- Keep all API paths, response contracts, dashboard functions, MCP tools and safety gates compatible.
- Test authentication/OAuth, research execution, queue recovery, data imports, backtests, settlement, learning, backups and monitoring.
- Prove parity with automated contract tests and a route/function coverage matrix.

### Phase 4 — data parity and recovery
- Inventory Blobs keys/collections and Neon structured records.
- Backfill only after a verified backup and owner approval.
- Reconcile record counts, keys, hashes, timestamps, provenance and collection semantics.
- Test restore and rollback without deleting or overwriting the source.
- Require zero unexplained discrepancies before cutover consideration.

### Phase 5 — owner-approved cutover
- Require all tests green, authenticated smoke tests, provider health checks, quota checks, backup verification and documented rollback.
- Obtain explicit owner approval immediately before production DNS, environment, database or routing changes.
- Keep Netlify fallback until the new platform has completed an agreed observation period.
- No automatic migration, merge, paid plan activation or production cutover is authorized by this plan.

## Known risks and open questions

- Netlify Blobs and Netlify Background Functions are platform-specific and are the largest migration surface.
- Netlify Edge authentication uses Web Crypto and request/cookie behaviour that must be retested on the target edge runtime.
- MCP/OAuth callback and issuer URLs are currently tied to the Netlify hostname; moving them requires careful redirect/resource compatibility and client reauthorization planning.
- Long-running research can exceed Cloudflare Worker CPU/duration constraints; it likely belongs in a queue or a Node.js worker runtime.
- Oracle Always Free availability and long-term suitability are not guaranteed.
- Local model throughput cannot be estimated until the exact AMD GPU and VRAM are identified.
- External sports sources have individual licensing, attribution, rate-limit and permitted-use conditions.
- Free plans are quota-limited; no design can honestly promise unlimited cloud compute or guaranteed free uptime.


## Deeper Phase 0 findings (read-only inspection)

### Runtime and storage compatibility

- The current deployment baseline is the PR #10 combined preview branch, not main: 53 function entrypoints and one Edge Function. The main branch contains an earlier 42-function baseline.
- The 53 function entrypoints are listed below so none is accidentally omitted during migration.
- netlify/lib/store.mts is the shared key/value abstraction. Its contract includes get, list, put, append, remove, conditional putIfNew, conditional putIfMatch, and getWithMetadata. Preserve conditional-write/ETag semantics, strong-read expectations, pagination, ordering, and JSON behaviour.
- The current store is not a simple single-store design. WIN_MEMORY_BACKEND supports blobs, mirror, and neon. Structured-memory prefixes can use Neon/mirroring, while raw event datasets, source payloads and non-memory collections remain in Netlify Blobs even when Neon mode is selected.
- OAuth state has a separate direct @netlify/blobs store named win-oauth; it does not currently use the shared store abstraction.
- The AI budget ledger has another direct @netlify/blobs store named win-engine. A migration must preserve its spending lock, reservations, monthly ledger, alerts and atomicity.
- Backup/restore code directly reads and writes Netlify Blobs and uses Node crypto plus gzip. These routines need an explicit provider-neutral backup adapter and round-trip tests; they must not be silently dropped.
- The runtime reads secrets through Netlify.env.get with a local process.env fallback. Replace this with a provider-neutral typed environment adapter while keeping secret values server-side.
- The package is ESM on Node.js 22 and includes @netlify/blobs, @netlify/functions, @neondatabase/serverless, @modelcontextprotocol/sdk, @openai/agents, and Zod. Netlify type imports, background-function behaviour, scheduled-function configuration, Blobs APIs and environment APIs are platform-specific.
- @openai/agents currently configures OpenAI as its model provider and uses the OpenAI web-search tool. Ollama/open-weight models are not a drop-in replacement: introduce a model-provider interface and explicit local-model adapter only after tests establish compatible tool, structured-output, timeout and usage behaviour.
- The Neon adapter uses the Neon serverless HTTP driver and implements conditional writes/ETags. It must be tested in each target runtime; do not assume all database drivers or transaction patterns work identically in Workers and a persistent Node.js service.

### Function inventory — all 53 entrypoints

**Dashboard/API, research and record operations**
- coverage.mts, department-smoke-test.mts, financial-memory.mts, health.mts, human-coupon-settlements.mts, human-coupons.mts, human-sources.mts, independent-review.mts, learning-observatory.mts, library.mts, memory-capacity.mts, memory-status.mts, observed-market-settlement.mts, predictions.mts, research-data.mts, research-source-candidates.mts, research-status.mts, results.mts, run-detail.mts, runs.mts, simulations.mts, sources.mts, sports.mts, tips.mts.

**Sports data, discovery and historical research**
- api-football-sync.mts, consensus-market-sync.mts, learning-data-jobs.mts, nflverse-audit.mts, openfootball-sync.mts, openfootball-worldcup-sync.mts, public-source-discovery.mts, sharpapi-sample-sync.mts, sportscore-live.mts, statsbomb-open-data.mts.

**AI, orchestration, monitoring and execution**
- ai-budget.mts, coverage-monitor.mts, hourly-monitor.mts, memory-capacity-monitor.mts, post-match-check.mts, post-match-followup.mts, post-match-runner.mts, scheduled-scout-runner.mts, simulation-runner.mts, worker-runner.mts.

**Memory migration, backup and recovery**
- memory-backfill.mts, memory-restore.mts, neon-memory-backup.mts.

**OAuth, MCP and AI-provider diagnostics**
- mcp.mts, oauth-authorize.mts, oauth-metadata.mts, oauth-register.mts, oauth-token.mts, openai-key-check.mts.

This is a functional inventory by entrypoint name, not yet the final route contract. Exact custom paths, HTTP methods, request/response schemas, auth scopes, timeout requirements and dashboard callers still need to be extracted into the route matrix.

### Confirmed schedules and background execution

- coverage-monitor.mts: every six hours (0 */6 * * *).
- hourly-monitor.mts: every four hours (0 */4 * * *).
- neon-memory-backup.mts: daily at 03:23 UTC (23 3 * * *).
- post-match-runner.mts, simulation-runner.mts, scheduled-scout-runner.mts, and worker-runner.mts are background-function workloads.
- Background work currently relies on durable state/locks in the shared store. A replacement queue must preserve leases, compare-and-set claims, retry counts, idempotency and recovery of abandoned jobs.
- Scheduled learning is explicitly gated by WIN_AI_BUDGET_APPROVED and the persistent AI spending lock. Preserve fail-closed behaviour; do not activate paid AI or scheduled AI workloads during migration.

### Edge, OAuth and public integration compatibility

- The only Edge Function in the audited tree is netlify/edge-functions/dashboard-auth.ts. Its cookie/session behaviour and protected-route coverage require dedicated tests before replacement.
- OAuth issuer and MCP resource constants are currently hard-coded to the Netlify hostname in netlify/lib/oauth-store.mts. The discovery document, redirect URI validation, PKCE S256, one-time authorization-code consumption, refresh-token rotation, scopes and MCP resource audience must be migrated together.
- MCP uses the Streamable HTTP transport from the MCP SDK and exposes both read-only/audit and research capabilities according to OAuth scopes. Keep the transport and scope boundaries intact.
- The live MCP server and OAuth endpoints are externally connected contracts; changing hostnames may require client reauthorization. Keep the old issuer operational during any transition until the owner approves a compatibility plan.


### Build and deployment trigger findings

- netlify.toml defines npm run build, publishes public/, points Netlify at netlify/functions, and selects Node.js 22. It does not define a separate deploy command or deploy-context policy.
- The inspected GitHub Actions workflows validate/build/test the repository. They do not invoke Netlify deployment commands or the Netlify CLI deploy command.
- The main-branch and pull-request workflows therefore should not be mistaken for the source of the 224 production deploys. Netlify's Git-connected deployment trigger/history and repository production-branch configuration need a separate read-only inspection to establish the exact cause; do not claim the cause is proven yet.
- Target deployment policy: one production deployment only from an approved main-branch commit; preview deployments limited to migration branches/PRs; CI validation should not itself publish; avoid repeated production pushes for documentation or experiments; use explicit concurrency/cancellation and build-path filters where safe.
- Track deployment count, build duration, request usage, compute, bandwidth and storage against each provider's free allowance. No automatic paid plan, credit purchase or billing fallback.

### Function-by-function target classification — preliminary

- Cloudflare Workers candidates: short request/response APIs, read-only dashboard endpoints, health/coverage/status, lightweight routing, authentication middleware, and bounded sports-data proxy endpoints. Each candidate still requires compatibility tests for runtime APIs, Node imports, request limits and data-store calls.
- Persistent Node.js worker candidates (Oracle only if free eligibility and capacity are confirmed): AI research orchestration, scheduled learning, post-match follow-up, simulations/backtests, large data imports, backup/restore and any work exceeding Worker CPU or request-duration limits.
- Cloudflare Queues / scheduled Workers candidates: durable dispatch and bounded recurring triggers only after queue delivery, retry, idempotency, visibility timeout and dead-letter behaviour are designed and tested.
- Storage adapter work required before porting: general WIN store, OAuth store, AI budget store, raw dataset/object storage and encrypted backup archive storage. Do not replace these with independent ad-hoc writes.
- Local Ollama integration: optional model endpoint for the persistent worker, not for public browser calls. The home PC may be offline; jobs must queue/defer without blocking core WIN availability.


### Dashboard and MCP public contract inventory (observed)

Dashboard app.js currently calls these API paths; preserve the request/response behaviour and auth expectations of every one: 
- /api/ai-budget
- /api/coverage
- /api/department-smoke-test
- /api/football-data
- /api/health
- /api/human-coupon-settlements
- /api/independent-review
- /api/learning-data-jobs
- /api/learning-observatory
- /api/library
- /api/memory-capacity
- /api/openai-key-check
- /api/post-match-check
- /api/predictions
- /api/research-source-candidates
- /api/research-status
- /api/runs (including run-detail paths)
- /api/simulations
- /api/sources
- /api/sportscore-live
- /api/statsbomb-open-data
- /api/tips

MCP endpoint: /mcp. The current server registers 20 tools:
- get_win_audit_overview
- list_win_audit_records
- get_win_audit_record
- start_research_run
- get_sportscore_live_matches
- get_run
- list_runs
- list_human_tips
- list_predictions
- search_win_library
- save_human_coupon
- record_coupon_outcome
- save_win_entity_profile
- save_win_learning_note
- validate_win_lesson
- run_historical_coupon_simulation
- run_strategy_backtest
- list_tipster_sources
- get_tipster_source_report
- import_public_tipster_coupon

The MCP tool list is scope-gated. Audit-only access must remain read-only; research scope must not gain coupon placement or bookmaker-account capabilities. Keep the existing OAuth protected-resource metadata path and WWW-Authenticate challenge behaviour.

Dashboard edge-auth paths observed include /__win_dashboard_login and /__win_dashboard_logout. The Edge Function uses Web Crypto HMAC signing, an eight-hour HttpOnly/SameSite=Strict session cookie, same-origin login checks and security response headers. Preserve those controls and test login, logout, expiry, tamper rejection, CSRF resistance and protected static assets.

### Environment-variable inventory status

- Confirmed runtime key names include WIN_MEMORY_BACKEND, WIN_NEON_DATABASE_URL, WIN_INTERNAL_TOKEN, OPENAI_API_KEY, OPENAI_MODEL, WIN_AI_BUDGET_APPROVED, and WIN_MEMORY_BACKUP_KEY.
- This list is not yet complete. Continue collecting every environment key reference across the 53 functions, 41 library modules, dashboard, build scripts and workflows. Never retrieve or expose secret values.

## Audit completion checklist

- [x] Repository identity, visibility, default branch and connected permissions checked.
- [x] Main and PR #10 file trees counted.
- [x] Existing PR #8, #9 and #10 state checked; all remain draft and unmerged.
- [x] Netlify project and recent deploy records inspected read-only.
- [x] Neon project, branches, tables and row counts inspected read-only.
- [x] Existing architecture and persistent-memory documentation reviewed.
- [x] Preliminary per-function runtime/dependency classification and all 53 function entrypoints inventoried; exact route contracts remain open.
- [ ] Exact API route/method/request-response/auth-scope and MCP tool inventory.
- [ ] Complete environment-variable key/name inventory (never expose secret values); partial key list recorded.
- [ ] Netlify Blobs collection inventory and backup/restore verification.
- [ ] Cloudflare and Oracle free-tier eligibility and compatibility review.
- [ ] Final function-by-function migration mapping and test matrix.


## Owner direction update — connected, workload-based architecture (2026-11-05)

This section supersedes any implication in the earlier proposal that WIN should undergo an absolute migration away from Netlify.

### Operating objective

The goal is to reduce operational, deployment and execution burden on Netlify while keeping the existing WIN product intact. Netlify remains an important production provider. Providers are added only when a measured workload, reliability or cost requirement justifies them. No provider is added merely to increase the number of clouds.

### Target connected architecture

- **GitHub:** canonical source code, review history, CI validation and controlled release authority.
- **Netlify:** retain the current dashboard, existing API routes, edge authentication and compatible serverless functions. Keep existing Blobs data and adapters until a collection-by-collection audit proves a safe reason to move any workload or data.
- **Neon:** retain as the relational database for the structured records it is explicitly assigned. Do not assume it already owns all production memory; the audited production tables were empty at audit time.
- **Cloudflare:** optional front-door services such as DNS, CDN, caching, rate limiting and selected lightweight stateless endpoints. Do not proxy every request through Workers if that adds latency, cost or another failure point.
- **Separate worker runtime:** only for measured long-running, scheduled, CPU/memory-heavy or durable background jobs that do not fit Netlify's execution model or free quota. Oracle Always Free is a candidate, not a dependency; eligibility and capacity must be verified. A queue/worker design must preserve existing locks, leases, retries and idempotency.
- **Ollama/local models:** optional private inference endpoint for suitable research/challenge tasks while the owner's PC is online. Core WIN functions must continue safely when local inference is unavailable.
- **Sentry/UptimeRobot or equivalent:** optional independent error and uptime monitoring, subject to free-tier and data-privacy checks. Avoid duplicate monitoring that creates noise or costs.

### Mandatory interconnection design

1. Define versioned service contracts for health, job submission/status, research execution, sports-data ingestion and persistence operations.
2. Use server-to-server authentication with least-privilege service identities, rotated secrets, timeouts, request IDs and bounded payloads. No secrets in browser code, Git or logs.
3. Establish one owner for each data class and collection. No uncontrolled dual-writes or competing sources of truth.
4. Use a durable job contract with idempotency keys, leases/compare-and-set claims, bounded retries, dead-letter handling and replay/recovery.
5. Use a provider-neutral storage interface while preserving the current Blobs semantics, including conditional writes, ETags, pagination and metadata.
6. Use a provider-neutral model interface. AI providers are replaceable; deterministic statistics, market settlement rules and WIN risk gates remain authoritative.
7. Propagate correlation IDs across services. Centralize structured logs, health, latency, failures, queue depth, data freshness, backup age and quota usage.
8. Define graceful degradation: if Cloudflare, a worker host, Neon, an external sports feed or Ollama is unavailable, unaffected WIN capabilities continue; dependent tasks are queued, retried safely or marked unavailable.
9. Keep backups and restore tests independent of the primary runtime. Alert before free quotas are exhausted. Never enable paid upgrades or auto-recharge.
10. Test contracts and failure modes in isolated preview/test environments before any production configuration or routing change.

### Revised implementation sequence

- **A. Complete the read-only inventory:** deployment triggers and costs, route contracts, env-key names, Blobs collections, job semantics, data ownership and provider dependencies.
- **B. Optimise Netlify first:** remove avoidable production deploy triggers, reduce duplicate background work and retries, and tune caching only where safe. Do not change production settings without explicit approval.
- **C. Add independent monitoring and security checks:** only after validating free tiers, privacy, alert routing and actual value.
- **D. Add Cloudflare selectively:** start with DNS/CDN/cache/protection; introduce Workers only for proven suitable workloads.
- **E. Offload background work only when justified:** select a separate runtime after measuring duration, memory, CPU, queue depth and quota pressure. Preserve the current Netlify path as fallback.
- **F. Connect local AI optionally:** add a provider adapter and offline-safe queue; never make core production availability depend on the owner's PC.
- **G. Verify end-to-end connectivity:** contract tests, auth tests, data reconciliation, retry/idempotency tests, outage simulation, backup/restore and quota guardrails.

### Explicit non-goals

- No full Netlify replacement or forced migration.
- No duplicate database or storage system without a clear data-ownership reason.
- No new paid plans, paid APIs, credit purchases or auto-recharge.
- No production cutover, production data migration, destructive changes or existing PR merges without separate explicit approval.
- No automated bookmaker bet placement.


## WIN persistent memory architecture — required design

Memory is a first-class cross-service capability, not merely an AI chat-history table. Preserve the current implementation and evolve it incrementally behind the existing store contract.

### Memory layers and ownership

1. **Operational/source records:** immutable or append-only source evidence, match snapshots, source payloads, predictions, frozen coupon/prediction records, result/settlement evidence and audit events. Keep the existing authoritative collection/storage ownership until the Blobs inventory proves otherwise. Never overwrite frozen historical predictions with later information.
2. **Relational entity and event memory (Neon candidate):** canonical IDs and relationships for sports, competitions, seasons, teams, players, matches/events, agents, sources, markets and model versions; structured observations, outcomes and evidence references. Neon is suitable for relational querying, but the audited production tables were empty, so no live cutover or authority claim is made yet.
3. **Agent episodic memory:** what an agent researched for a specific match/run, evidence considered, FOR/AGAINST arguments, decisions, uncertainty and outcome. Link to immutable run IDs and source evidence rather than copying large payloads unnecessarily.
4. **Semantic/knowledge retrieval:** embeddings and searchable summaries for relevant prior cases, lessons and source documents. Add a vector index only after measuring retrieval needs and selecting a compatible, affordable implementation; do not introduce a second database by default.
5. **Validated learning memory:** candidate lessons are not automatically trusted. Store proposed lesson, supporting sample, counterexamples, time range, confidence, validation status, reviewer and version. Promote only after minimum sample size, out-of-sample checks and chronological backtests. Keep rejected/expired lessons with reasons to prevent repeated rediscovery.
6. **Configuration and policy memory:** versioned agent instructions, sport/market rules, calibration versions, risk limits and source quality policies. Changes must be reviewable and traceable; never silently mutate historical decision context.

### Required memory record envelope

Each record should carry, where applicable: stable record ID; record type; sport/competition/season; entity IDs; match/event/run/coupon IDs; agent and model/provider/version; source ID and source URL/reference; observed-at and ingested-at timestamps in UTC; event-time; schema version; provenance/licence; confidence and uncertainty; validation/review state; content hash; sensitivity/retention class; and links to related records. Store timestamps and provenance consistently. Avoid storing secrets or unnecessary personal data.

### Memory lifecycle

- Ingest raw evidence with provenance and deduplication/content hashes.
- Normalize entities and link records using stable IDs; keep source-native IDs as aliases.
- Preserve immutable snapshots for the exact evidence available when each prediction/decision was made.
- Retrieve relevant prior cases using sport, league, season, teams/entities, market, context and time; do not leak future information into historical simulations.
- Let agents propose observations and lessons; validate them independently.
- Evaluate lessons with chronological/out-of-sample backtests and counterexamples before promotion.
- Record outcomes and settlement as append-only events; update derived summaries without rewriting original evidence.
- Apply retention, archival, export and restore policies by record class; keep auditability and deletion/legal requirements explicit.

### Retrieval and learning safeguards

- Enforce strict temporal cutoffs in simulations and backtests to prevent look-ahead leakage.
- Separate factual evidence, agent opinion, model-generated summaries and validated lessons.
- Return citations/provenance and freshness with retrieved memory; agents must be able to say evidence is missing or stale.
- Avoid unbounded accumulation: deduplicate, summarize only with source links, expire caches, and retain canonical evidence.
- Use confidence calibration and minimum sample sizes; track performance by sport, league, market, season and model/agent version.
- Never let one agent's unverified claim become global truth or let AI override deterministic settlement, quantitative evidence or WIN risk gates.
- Memory retrieval failure must degrade to explicit limited-evidence analysis / NO BET where mandatory evidence is unavailable, not fabricate remembered facts.

### Cross-service memory access

- All services use one versioned memory API/store contract; no provider should write ad-hoc records directly into another provider.
- Define operations such as appendEvidence, getRecord, queryEntities, retrieveCases, proposeLesson, validateLesson, recordOutcome and getMemoryHealth.
- Authenticate service identities and scope writes by record type/agent role. Read/write permissions are least-privilege; research agents cannot modify frozen predictions or promote their own lessons.
- Use idempotency keys, conditional writes/ETags, schema-version checks, request IDs and audit trails.
- Use an outbox or durable event mechanism for cross-store projections; retries must not duplicate learning or settlement events.
- Establish one authoritative owner per record class. If Neon is eventually made authoritative for a class, backfill and compare IDs/counts/hashes first, then require explicit approval before switching reads/writes.
- Monitor memory health: write/read failures, duplicate rate, orphan references, stale records, query latency, storage growth, backup age and restore-test status.

### Immediate memory work

1. Finish a read-only inventory of all Blobs stores/collections and prefixes, Neon schema/migrations/branches, memory adapter modes and every memory-related read/write path.
2. Document the source of truth per record class and map all writers/readers (functions, dashboard, MCP tools, background jobs).
3. Test the existing backup/restore round trip using isolated test data only; do not touch production records.
4. Add missing contract tests for conditional writes, append/idempotency, pagination, metadata, schema evolution and temporal retrieval.
5. Design Neon relational tables/indexes and optional semantic retrieval only from observed query patterns; use a dedicated test branch and synthetic fixtures.
6. Preserve current APIs and records; propose any production migration separately with export, hashes, reconciliation, rollback and owner approval.

### Explicit memory non-goals

- Do not treat the three empty Neon production tables as proof that production memory is empty.
- Do not delete, compact destructively, rewrite or bulk-migrate existing Blobs data during discovery.
- Do not make all services independently maintain their own copies of memory.
- Do not auto-promote AI-generated lessons into trusted knowledge.
- Do not let local Ollama availability become a prerequisite for memory reads/writes or core WIN operation.


## Additional owner-supplied architecture ideas — reference notes (2026-11-05)

The owner supplied an example Python monorepo/deployment generator and an autonomous sports-prediction workflow. Treat this material as design inspiration and requirements input, not as approved code, a fixed technology choice, or an instruction to reproduce its architecture literally.

### Concepts to retain for future design

- **Modular monorepo:** keep related orchestration, ML, memory, reliability, configuration, tests and deployment definitions organised in one repository, while deploying components independently where their runtime needs differ.
- **Separate ML service:** isolate model training/inference from lightweight API orchestration. Use a real, versioned and validated model rather than a placeholder probability. The model service must expose a stable provider-neutral contract.
- **Risk circuit breaker:** check exposure and risk state before coupon approval. Include daily and per-coupon limits, unsettled exposure, anomaly/drift conditions, emergency stop and authorised reset. Distinguish recommendations, manually approved wagers and confirmed actual stakes.
- **Concurrency safety:** exposure checks must use atomic reservations/conditional writes and idempotency; a simple SUM query followed by an insert is race-prone.
- **API resilience:** validate HTTP status, response schema and freshness; apply timeouts, bounded retries/backoff, rate-limit handling, structured errors and provider health reporting. Missing critical evidence must fail closed to WAIT/NO BET.
- **Heartbeat and alerting:** monitor scheduled-job completion and external dependencies independently; verify notification delivery and alert when a critical provider or job remains unavailable.
- **Cold-start handling:** if a hosted ML service sleeps, use a bounded readiness/real-request retry strategy and explicit degraded status. Do not rely on an unbounded dummy wake-up request or make a sleeping free-tier service a critical dependency.
- **Post-match feedback:** scheduled result ingestion and market-specific settlement should connect immutable pre-match predictions to verified outcomes. Record actual financial returns only for manually confirmed/actual wagers; prediction accuracy is not profit.
- **Learning loop:** evaluate model performance by sport/competition/market/version, detect drift, propose retraining and lessons, and require chronological/out-of-sample validation before promoting a model or lesson.
- **Notifications:** Discord/Telegram can be optional notification adapters, not the source of truth or a substitute for the WIN dashboard and audit records.

### Technology and code are not pre-approved

The supplied example mentions Cloudflare Workers/Python, D1, Hugging Face Spaces, Groq, The Odds API and Discord. These are candidates only, subject to current documentation, free-tier limits, data licensing, security review, compatibility tests and a demonstrated need.

Do not create a parallel D1 database for records already owned by Neon or Netlify Blobs. Do not introduce a second orchestration or betting system alongside WIN. Reuse the existing Netlify routes, store abstraction, AI budget controls, background-job patterns, result/settlement pipeline and memory contracts wherever suitable.

The sample generator and scripts are illustrative and must not be deployed as-is. In particular, placeholder model probabilities, unverified API endpoints, plaintext secrets, non-atomic exposure checks, weak response handling and simplistic match-ID deduplication are not acceptable production implementations.

### Design principle

Choose the simplest architecture that meets WIN's measured workload and reliability requirements. Keep one coordinated memory architecture with explicit data ownership, while allowing each service to maintain only the operational state it needs. Services must communicate through versioned authenticated contracts, and failures must degrade safely without fabricating predictions or bypassing WIN's risk gates.

