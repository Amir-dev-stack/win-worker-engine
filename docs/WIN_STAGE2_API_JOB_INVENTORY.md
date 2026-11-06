# WIN Stage 2 — API and scheduled-job inventory (first pass)

Audit branch: `docs/win-staged-build-roadmap`
Audited tree: `4d3d5e00bf0e27a946957741103acd99f0f0e093`
Base: `main` at `61aa7112f0e5be08e52cfd507b4bac00137ab727`

Status: source-level inventory only. This is not a complete authorization review, live deployment inventory, or proof that scheduled functions are active. The current audited tree contains 43 `netlify/functions/*.mts` files. PR #8, #9 and #10 remain separate and unmerged; their additional routes and memory/backup handlers are not counted here.

## 1. Explicit API paths

The following explicit `config.path` declarations were found. A direct `requireAuth`/authorization marker was found in the handler source unless otherwise stated.

| Path | Handler | Initial auth observation |
|---|---|---|
| `/api/ai-budget` | `ai-budget.mts` | Direct auth marker |
| `/api/coverage` | `coverage.mts` | Direct auth marker |
| `/api/department-smoke-test` | `department-smoke-test.mts` | Direct auth marker |
| `/api/health` | `health.mts` | Direct auth marker; inspect whether every method/response is appropriately protected |
| `/api/human-coupon-settlements` | `human-coupon-settlements.mts` | Direct auth marker |
| `/api/human-coupons` | `human-coupons.mts` | Direct auth marker |
| `/api/human-sources` | `human-sources.mts` | Direct auth marker |
| `/api/independent-review` | `independent-review.mts` | Direct auth marker; branch-level reviewer authorization also exists |
| `/api/learning-data-jobs` | `learning-data-jobs.mts` | Direct auth marker |
| `/api/library` | `library.mts` | Direct auth marker |
| `/api/ml-owner-approval` | `ml-owner-approval.mts` | Dedicated owner-only bearer token plus protected public-key/reviewer configuration; distinct from dashboard `requireAuth` |
| `/mcp` | `mcp.mts` | Direct auth marker; inspect OAuth scopes and tool-level authorization separately |
| `/oauth/authorize` | `oauth-authorize.mts` | OAuth protocol flow; not dashboard `requireAuth` |
| `/oauth/register` | `oauth-register.mts` | OAuth client-registration flow; not dashboard `requireAuth` |
| `/oauth/token` | `oauth-token.mts` | OAuth token/grant flow; not dashboard `requireAuth` |
| `/api/openai-key-check` | `openai-key-check.mts` | Direct auth marker |
| `/api/post-match-check` | `post-match-check.mts` | Direct auth marker |
| `/api/predictions` | `predictions.mts` | Direct auth marker |
| `/api/research-data` | `research-data.mts` | Direct auth marker |
| `/api/research-source-candidates` | `research-source-candidates.mts` | Direct auth marker |
| `/api/research-status` | `research-status.mts` | Direct auth marker |
| `/api/results` | `results.mts` | Direct auth marker |
| `/api/runs` | `runs.mts` | Direct auth marker |
| `/api/runs/:id` | `run-detail.mts` | Direct auth marker |
| `/api/simulations` | `simulations.mts` | Direct auth marker |
| `/api/sources` | `sources.mts` | Direct auth marker |
| `/api/sports` | `sports.mts` | Direct auth marker |
| `/api/tips` | `tips.mts` | Direct auth marker |
| `/api/learning-observatory` | `learning-observatory.mts` | Direct auth marker |

This table records source markers, not verified effective protection. The next security pass must confirm every HTTP method, authentication branch, role/scope, CORS policy, request validation, and whether error paths or alternate dispatch paths bypass the check. OAuth routes must be assessed against their own protocol state, client, redirect URI, PKCE, grant and token rules; they must not be labelled public merely because they do not call dashboard `requireAuth`.

## 2. Scheduled functions with explicit source declarations

The following schedule declarations were read directly from the audited branch:

| Function | UTC cron | Intended cadence / purpose |
|---|---|---|
| `hourly-monitor.mts` | `0 */4 * * *` | Every four hours; bounded learning/scout orchestration, subject to internal token, budget approval, spending lock and missing-key gates |
| `consensus-market-sync.mts` | `17 5 * * *` | Daily public consensus dataset sync and market calibration |
| `coverage-monitor.mts` | `0 */6 * * *` | Every six hours; save data-coverage snapshot |
| `public-source-discovery.mts` | `17 2 * * *` | Daily metadata-only public source discovery; no content download or adapter activation |
| `openfootball-sync.mts` | `17 3 * * *` | Daily deterministic historical-data sync and baseline experiment when scored matches exist |
| `sharpapi-sample-sync.mts` | `37 6 * * 1` | Weekly static public sample refresh; not a live odds feed |

Cron declarations prove only what is in source. They do not prove that Netlify has activated these schedules, that the site is currently running, or that any invocation succeeded. The site has previously been paused because of account credits; no schedule was started or changed during this audit.

## 3. Functions requiring trigger-chain review

These 15 function files do not have an explicit `config.path` in the audited source or need additional trigger classification:

- `consensus-market-sync.mts`
- `coverage-monitor.mts`
- `hourly-monitor.mts`
- `learning-data-jobs.mts`
- `oauth-metadata.mts`
- `observed-market-settlement.mts`
- `openfootball-sync.mts`
- `openfootball-worldcup-sync.mts`
- `post-match-followup.mts`
- `post-match-runner.mts`
- `public-source-discovery.mts`
- `scheduled-scout-runner.mts`
- `sharpapi-sample-sync.mts`
- `simulation-runner.mts`
- `worker-runner.mts`

Do not infer that these are inaccessible or public from the absence of an explicit path. Inspect Netlify's default function routing, `netlify.toml` redirects, imports/callers, request guards and job orchestration before assigning exposure or authorization status.

## 4. Remaining Stage 2 inventory work

1. Extract exact HTTP methods and request/response validation from every explicit route.
2. Trace auth middleware and every OAuth/MCP scope to the actual protected operation.
3. Record read/write collections, external hosts, timeout/budget use, and side effects per route.
4. Inspect Netlify redirects and default function URLs for handlers without explicit paths.
5. Trace scheduled runner invocation chains, lock ownership, stale recovery, retry ceilings and heartbeat/error records.
6. Read deployed schedule configuration and execution history, read-only, when the Netlify site is accessible. Do not restart or trigger production schedules to test them.
7. Repeat the inventory on the eventual integrated PR #8/#9/#10 branch before treating it as the full WIN route map.

## 5. Safety boundary

No production deployment, schedule change, live job invocation, database migration, storage backfill/restore, provider import, paid service, or credential change was performed. This document is a first-pass source inventory, not a sign-off that every route is secure or every job operational.


## 6. ML owner-approval control plane update

The current tree adds `/api/ml-owner-approval`. Source inspection confirms POST-only handling, a dedicated `WIN_ML_OWNER_APPROVAL_TOKEN` (minimum 32 characters), and required protected `WIN_ML_OWNER_APPROVAL_PUBLIC_KEY` plus `WIN_ML_OWNER_REVIEWER_ID` configuration. Supported actions are `licence_evidence`, `readiness`, `approve`, `revoke`, `list` and `status`. Request bodies cannot supply the trusted key or token. The endpoint returns 503 when its protected control-plane configuration is absent and does not expose GET.

This is a source-level control review only. The endpoint is not enabled by this audit; no owner approval secrets were configured, no signed approval was registered and no training was run.



## 7. Focused scheduled-runner request-boundary review (2026-11-06)

Audited against the current PR tree after the request-boundary hardening commit:

- `scheduled-scout-runner.mts` is a Netlify background function with no explicit public `config.path`; it is invoked internally by `hourly-monitor.mts` using `POST` and the protected `WIN_INTERNAL_TOKEN`.
- The handler now rejects non-POST methods, requires JSON content type, checks declared content length and enforces a streaming 16 KiB body cap before buffering, rejects invalid UTF-8, parses JSON only after the size check, and requires a trimmed non-empty `runId` of at most 180 characters.
- The validation is isolated in `readScheduledScoutRunId` and covered by `scripts/scheduled-scout-request.test.mjs` for accepted IDs, method rejection, content-type rejection, malformed/missing/invalid IDs, and oversized bodies.
- The endpoint still requires the internal bearer token before request parsing and remains gated by `WIN_AI_BUDGET_APPROVED`, the persistent spending lock and existing AI-budget checks before research execution.

## 8. Scheduled-run execution ownership and crash recovery (2026-11-06)

The duplicate-invocation gap identified above has been addressed in source:

- New module: `netlify/lib/scheduled-run-lease.mts`.
- Each run receives a lease under `library/scheduled-run-leases/`, keyed by SHA-256 of the run ID.
- Initial ownership uses `putIfNew`; expired-lease reclamation and release use ETag-conditional `putIfMatch`.
- A live lease blocks a duplicate invocation. Only the invocation holding the matching lease ID may release it.
- An existing active lease with malformed expiry metadata fails closed as contention; it is not silently reclaimed.
- A process crash leaves the lease to expire (default 30 minutes); a later invocation can reclaim it. Lease duration is bounded to at most 60 minutes.
- The scheduled runner acquires the lease after validating the run and checking whether it is already complete. A duplicate sees HTTP 202 with `already_running`; bounded contention errors fail closed with HTTP 503.
- The lease is released in `finally` after normal completion or handled failure. If release fails or the process crashes, expiry is the recovery path.
- `scripts/scheduled-run-lease-isolated.test.mjs` covers concurrent ownership, duplicate rejection, owner-only release, expiry/reclaim and stale-worker protection.
- `scripts/scheduled-scout-request.test.mjs` covers the request boundary. Both tests are included in the build's required-file list and the lease contract is included in architecture quality gates.

Limitations remain explicit:
- The tests use the isolated in-memory adapter; they do not prove provider-side Netlify Blobs atomicity.
- There is no lease heartbeat. The 30-minute default exceeds the current expected background-run window, but if real executions can exceed that duration, a heartbeat/renewal contract should be added before increasing workload.
- No CI run is visible for the current PR head, so these new tests and quality gates remain unexecuted.
- This does not prove that Netlify's scheduler is active or establish the deployed invocation history.

No live invocation, production schedule change, provider call, deployment or credential change was made.


## 9. CI evidence clarification (2026-11-06)

The GitHub connector's `fetch_commit_workflow_runs` view filters to pull-request-triggered runs. The branch workflow also triggers on pushes, so an empty response from that particular view is not proof that no push-triggered run exists.

A direct job-log inspection verified push-triggered run [#42144616719](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/42144616719):
- The checkout log records exact source SHA `8e2e5d1f83bdc37d86aedb32c83b99902aba71f1`.
- `npm test`: 148 tests passed, 0 failed.
- Architecture quality gates: 135 passed.
- `npm run build`: passed, reporting 96 required files and 44 architecture checks.

That is valid CI evidence for commit `8e2e5d1` only. The scheduled-run request/lease changes were committed later, so this historical green run does not verify the current PR head. No current-head execution claim is made.
