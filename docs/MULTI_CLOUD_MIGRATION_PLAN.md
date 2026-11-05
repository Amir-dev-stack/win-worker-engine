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

## Audit completion checklist

- [x] Repository identity, visibility, default branch and connected permissions checked.
- [x] Main and PR #10 file trees counted.
- [x] Existing PR #8, #9 and #10 state checked; all remain draft and unmerged.
- [x] Netlify project and recent deploy records inspected read-only.
- [x] Neon project, branches, tables and row counts inspected read-only.
- [x] Existing architecture and persistent-memory documentation reviewed.
- [ ] Full per-function runtime/dependency classification.
- [ ] Full API route and MCP tool inventory.
- [ ] Environment-variable key/name inventory (never expose secret values).
- [ ] Netlify Blobs collection inventory and backup/restore verification.
- [ ] Cloudflare and Oracle free-tier eligibility and compatibility review.
- [ ] Function-by-function migration mapping and test matrix.
