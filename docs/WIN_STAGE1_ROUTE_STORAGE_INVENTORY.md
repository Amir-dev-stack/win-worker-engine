# WIN Stage 1 — route, scheduler and storage inventory (2026-11-05)

Status: partial code-level inventory from the combined PR #10 tree at `17dc194392de8ff4458dcd18a036d6dde99f315b`. This is a source-code inspection only. It does not prove that a Netlify schedule is active in the deployed site or that any job has run successfully.

## 1. Direct Netlify Blobs access — confirmed sites

The combined tree has multiple access paths that must not be collapsed into one generic adapter without preserving their semantics.

| File / module | Store | Responsibility | Required preservation |
|---|---|---|---|
| `netlify/lib/store.mts` | `win-engine`, EU Central, strong consistency | Shared WIN key/value adapter; default primary; optional curated-memory mirror/Neon mode | JSON semantics, strong reads, pagination, ordering, conditional writes, fallback behavior and current 23-prefix allowlist |
| `netlify/lib/ai-budget.mts` | `win-engine`, EU Central, strong consistency | AI budget settings, reservations, controller lock and spend ledger | Keep its own lock/ledger protocol, limits, reservations and fail-closed spending controls; do not reroute through generic library storage |
| `netlify/lib/oauth-store.mts` | `win-oauth`, strong consistency | OAuth records/state and token-related operations | Separate namespace and token-consumption semantics; never merge into general library memory |
| `netlify/functions/memory-capacity.mts` | `win-engine`, EU Central, strong consistency | Authenticated memory capacity/status read | Read-only route; preserve authentication and response contract |
| `netlify/lib/memory-capacity.mts` | `win-engine` | Capacity inventory/history operations | Direct lazy import of Blobs; inspect all callers before changing ownership |
| `netlify/functions/neon-memory-backup.mts` | `win-engine` | Scheduled encrypted snapshot and manifest/retention records | Conditional lock, encryption, hashes, row/byte limits, retention and manifest semantics |
| `netlify/functions/memory-backfill.mts` | `win-engine` | Explicitly confirmed Blobs-to-Neon backfill and progress/lock records | Auth, mirror-mode-only gate, confirmation string, inventory/hash verification and progress recovery |
| `netlify/functions/memory-restore.mts` | `win-engine` | Explicitly confirmed encrypted snapshot restore into Neon | Auth, mirror-mode-only gate, snapshot verification, key allowlist, conditional lock and restore status |

The shared store uses a dynamic import of `@netlify/blobs`; the AI budget and OAuth modules have their own direct imports; the memory capacity library also dynamically imports Blobs. The three backup/backfill/restore functions access Blobs directly by design. The inventory above is confirmed for the inspected source paths; a final repository-wide search and caller trace remains an audit task before any adapter refactor.

### Storage ownership decisions

- Do not assume all `library/*` data belongs in Neon. Raw event datasets, source payloads and non-memory collections remain Blobs-only under the current adapter.
- The curated structured-memory allowlist currently contains 23 prefixes. The same list is duplicated in the shared store, backup, backfill and restore modules; it currently matches but can drift.
- Do not expand or reduce that allowlist in this stage.
- Do not change `WIN_MEMORY_BACKEND`, environment variables, credentials, database rows, Blobs keys or production settings.
- Neon remains a secondary mirror only when explicitly configured; the existing code describes Blobs as source of truth until backfill and reconciliation are complete.
- The financial-memory routes use the Neon financial account/ledger API. Their code path is distinct from the AI budget ledger and must not be conflated with real bookmaker transactions.

## 2. Scheduled function declarations found in source

The following cron expressions are declared in the inspected PR #10 tree:

| Function | Declared schedule (UTC) | Purpose / notes |
|---|---|---|
| `hourly-monitor.mts` | `0 */4 * * *` | Despite the filename, runs every four hours; starts bounded scheduled learning/scout work subject to internal token and budget gates |
| `consensus-market-sync.mts` | `17 5 * * *` | Daily market-consensus sync |
| `coverage-monitor.mts` | `0 */6 * * *` | Every six hours |
| `public-source-discovery.mts` | `17 2 * * *` | Daily public-source discovery |
| `neon-memory-backup.mts` | `23 3 * * *` | Daily encrypted Neon memory snapshot |
| `memory-capacity-monitor.mts` | `40 3 * * *` | Daily memory-capacity history/monitor |
| `post-match-followup.mts` | `23 */4 * * *` | Every four hours; post-match follow-up |

Other runner functions are configured as background functions or explicit API routes, not as cron schedules in their own source declaration. Examples include `scheduled-scout-runner.mts`, `worker-runner.mts`, `simulation-runner.mts` and `post-match-runner.mts`.

Important: these are declarations in the feature-branch source. They do not prove live Netlify schedule activation, successful execution, or absence of a paused-site/billing restriction. Before adding any scheduler, inspect the deployed site's configured functions and execution history; do not create a parallel scheduler.

## 3. Route catalog — initial verified sample

The following explicit routes were verified from `config.path` declarations. Authentication is enforced by `requireAuth` in the listed handlers unless noted otherwise; actual scope/role behavior still requires the separate auth/MCP policy audit.

| Route | Handler | Methods observed | Auth observation |
|---|---|---|---|
| `/api/health` | health | handler reads health request | `requireAuth` |
| `/api/predictions` | predictions | GET | `requireAuth` |
| `/api/results` | results | POST | `requireAuth` |
| `/api/runs` | runs | GET, POST | `requireAuth` |
| `/api/runs/:id` | run-detail | GET | `requireAuth` |
| `/api/simulations` | simulations | GET, POST | `requireAuth` |
| `/api/sources` | sources | GET, POST | `requireAuth` |
| `/api/coverage` | coverage | GET | `requireAuth` |
| `/api/sports` | sports | GET | `requireAuth` |
| `/api/tips` | tips | GET, POST | `requireAuth` |
| `/api/research-data` | research-data | GET, POST | `requireAuth` |
| `/api/research-status` | research-status | GET | `requireAuth` |
| `/api/research-source-candidates` | research-source-candidates | GET, POST | `requireAuth` |
| `/api/human-coupons` | human-coupons | GET | `requireAuth` |
| `/api/human-sources` | human-sources | GET, POST | `requireAuth` |
| `/api/human-coupon-settlements` | human-coupon-settlements | GET, POST | `requireAuth` |
| `/api/independent-review` | independent-review | GET, POST | Handler has request branches; confirm authorization at every branch in the dedicated review |
| `/api/department-smoke-test` | department-smoke-test | GET, POST | `requireAuth` |
| `/api/openai-key-check` | openai-key-check | POST | `requireAuth` |
| `/api/ai-budget` | ai-budget | GET, POST | `requireAuth` |
| `/api/financial-memory` | financial-memory | GET, POST | `requireAuth` |
| `/api/memory-status` | memory-status | GET | `requireAuth` |
| `/api/memory-capacity` | memory-capacity | GET | `requireAuth` |
| `/api/memory-backfill` | memory-backfill | POST | `requireAuth` plus explicit confirmation and mirror-mode gate |
| `/api/memory-restore` | memory-restore | POST | `requireAuth` plus explicit confirmation and mirror-mode gate |
| `/api/post-match-check` | post-match-check | POST | `requireAuth` |
| `/api/sportscore-live` | sportscore-live | GET | `requireAuth` |
| `/oauth/authorize` | oauth-authorize | GET, POST | OAuth authorization flow; not the dashboard `requireAuth` middleware |
| `/oauth/token` | oauth-token | POST | OAuth token flow; inspect client authentication and grant checks separately |

This is a verified sample, not yet a complete route contract. The remaining route handlers, MCP scope mapping, request/response schemas, side effects, CORS behavior, rate limits and all authorization branches still need a line-by-line inventory. Do not infer that every route is protected merely because most dashboard API handlers call `requireAuth`.

## 4. Reliability observations to carry into the next audit pass

- `hourly-monitor` checks `WIN_INTERNAL_TOKEN` before calling the scheduled scout runner and records scheduler/heartbeat state. Its AI work is described as bounded and subject to explicit budget approval.
- The scheduled scout runner contains stale-task recovery logic and caps attempts before marking a task failed; inspect its lease age and task idempotency before changing retry behavior.
- `worker-runner` checks research execution and persistent AI spending locks before proceeding; blocked runs are intentionally rejected.
- `post-match-runner` uses conditional store operations for its runner lock and writes scheduler state.
- `learning-data-jobs` uses per-action locks and scheduler state; the route requires auth.
- The memory backup has a scheduled declaration and an ETag/conditional lock. Its restore and backfill functions are explicit POST operations and require owner confirmation.
- No production schedule, lock, backup, backfill, restore or data operation was executed during this audit.

## 5. Remaining Stage 1 work

- Finish a repository-wide direct Blobs import/getStore call search and map all callers, including any indirect imports.
- Finish every function route/method/request/response/auth-scope/side-effect contract, including MCP and OAuth.
- Inventory every scheduled and background job's trigger, timeout, lock lease, retry ceiling, idempotency key, heartbeat and stale-job recovery.
- Verify which Netlify schedules are actually configured and their latest run outcomes without triggering them.
- Reconcile every library collection with its writer, reader, Blobs/Neon owner, backup scope, retention and licensing.
- Complete environment-variable **name-only** inventory; never retrieve or expose secret values.
- Trace frozen prediction IDs, point-in-time evidence snapshots, model versions and actual-wager confirmation separately.
- Finish ML dataset coverage, event-time and licence audit before creating a Python workspace or training any model.

## 6. Safety boundary

This inventory does not authorize a storage refactor, migration, schedule change, data import, production deployment, merge, paid provider, or credential change. Stage 2 may begin only with isolated contract tests and diagnostic manifests that preserve existing storage routing, prefix membership, job cadence and production state.
