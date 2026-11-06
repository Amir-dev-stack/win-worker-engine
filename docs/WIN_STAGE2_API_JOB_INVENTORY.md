# WIN Stage 2 — API and scheduled-job inventory (first pass)

Audit branch: `docs/win-staged-build-roadmap`
Source snapshot for the request-boundary follow-up: `ac85a6bc3af3170941f8816f0bc1e9ea10806d98` (the document update itself creates a later commit).
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


## 10. Result submission request-boundary hardening (2026-11-06)

The `/api/results` handler now uses `readResultSubmissionBody` before reading any settlement fields:

- Requires `application/json`; other content types receive HTTP 415.
- Rejects a declared content length over 64 KiB and independently enforces a streaming 64 KiB cap before buffering.
- Rejects invalid UTF-8, malformed JSON, and JSON values that are not objects.
- Keeps the existing authentication and POST-only checks ahead of body parsing.
- Adds `scripts/results-request-validation.test.mjs` for accepted JSON, content-type rejection, malformed/non-object JSON, declared and streamed size limits, and invalid UTF-8.
- Adds the test to build-required files and adds a quality-gate assertion for the request-boundary contract.

These are source changes and synthetic tests; no current-head CI execution is claimed. Existing result-submission claim/idempotency behavior is otherwise unchanged. Provider-side store atomicity and correction workflow remain separate open verification items.


### Owner-approval request-body boundary hardening (2026-11-06)
- Replaced post-buffer size checking with incremental request-stream reading capped at 64 KiB, including early declared-content-length rejection.
- Owner approval now rejects invalid UTF-8, malformed JSON and non-object JSON before action dispatch.
- Content-Type validation now compares the parsed media type exactly to `application/json`; values such as `application/jsonp` and `application/json-evil` are rejected.
- Applied the same exact media-type check to `/api/results`.
- Added endpoint and parser regressions for streamed oversize requests, invalid UTF-8, malformed/non-object JSON and misleading media types.
- No approval credentials, signed approvals, training execution or provider activation were changed.


- Follow-up audit tightened the scheduled-scout runner's JSON media-type check to reject misleading values such as `application/jsonp` and `application/json-evil`; regression coverage and architecture gate added.


## 10. OAuth endpoint request-boundary review (2026-11-06)

- Added a shared bounded OAuth request parser for URL-encoded form and JSON payloads. It incrementally reads the request stream, checks declared and actual byte counts, decodes strict UTF-8 and rejects unsupported media types.
- Authorization POST accepts only URL-encoded form data with an 8 KiB cap. Token POST accepts only URL-encoded form data with a 16 KiB cap. Dynamic client registration accepts only JSON objects with a 16 KiB cap.
- Duplicate form parameter names, excessive parameter counts, overlong keys/values, malformed JSON, non-object JSON and invalid UTF-8 are rejected.
- Authorization state/client/redirect/scope fields and token client/code/redirect/verifier/refresh-token fields receive explicit bounds.
- Dynamic registration now rejects malformed optional grant/response-type declarations rather than silently accepting non-array values or arrays that omit the authorization-code grant.
- These are source-level and isolated parser-contract changes. OAuth provider round-trip, browser UX, deployed callback compatibility and rate-limit enforcement still require separate verification.


### OAuth consent and authorization-code race follow-up (2026-11-06)
- Replaced the generic consent description with scope-specific permission text. A `win:read` grant no longer claims it can start research; `offline_access` is described as refresh-token continuity; audit remains read-only.
- Authorization POST now stages a short-lived code and atomically consumes the authorization transaction using the stored ETag. If two browser submissions race, only the code committed by the compare-and-swap winner is returned; a losing staged code is an unreachable short-lived orphan.
- Existing browser retry behavior is preserved: a retry after successful consumption receives the same committed code until its short expiry.
- Added a focused consent-description test and architecture-gate assertions. The CAS uses the existing conditional-write contract; live Netlify Blobs race verification remains outstanding.


### MCP per-tool authorization review (2026-11-06)
- Inspected all 19 registered MCP tools. Each declares an OAuth2 scope in its tool metadata and checks the same scope inside its handler.
- The three `win:audit` tools are read-only and use the explicit audit collection allowlist; the audit handler paths contain no storage mutation calls.
- Added an architecture quality gate that enumerates every `registerTool` block and requires its declared OAuth scope to match an in-handler scope guard. New tools cannot silently omit this dual declaration/check.
- Tightened audit consent wording to state explicitly that the scope cannot start research, write records, approve coupons or place bets.
- This remains source-level inspection; OAuth callback compatibility, provider-side storage races and deployed rate-limit enforcement are not proven by the static gate.


### Independent-review request boundary (2026-11-06)
- The `/api/independent-review` POST handler previously parsed the request body before checking either the owner token or separate reviewer credential and had no request-size cap.
- It now checks GET/POST method first, authenticates the caller before reading the POST body, then accepts only `application/json` and reads at most 64 KiB incrementally. Declared length, actual streamed bytes, strict UTF-8, JSON syntax and object shape are validated.
- Owner credentials may create/rotate the separate reviewer credential, but cannot submit review decisions. Review decisions still require the separate reviewer credential.
- Added isolated parser tests, build requirements and a quality gate for auth-before-body ordering. No reviewer credential was created or rotated by this change.


### Health route method boundary (2026-11-06)
- `/api/health` already required the internal bearer token and did not mutate state, but accepted every HTTP method. It now explicitly permits GET only and returns 405 with `no-store` for other methods.
- Added an architecture gate requiring both authentication and GET-only routing.


### Shared bounded JSON parsing for authenticated write routes (2026-11-06)
- Added a reusable strict JSON-object parser with incremental stream reads, declared and actual byte caps, strict UTF-8, exact `application/json` media type and malformed/non-object rejection.
- Applied route-specific limits after authentication and POST method checks: `/api/runs` 64 KiB, `/api/library` 128 KiB, `/api/learning-data-jobs` 8 KiB, `/api/human-coupon-settlements` 16 KiB and `/api/human-sources` 64 KiB.
- The shared helper rejects invalid configured limits rather than silently disabling the cap. Added isolated tests, build registration and a quality gate.


- The follow-on shared parser pass also moved `/api/runs`, `/api/library`, `/api/learning-data-jobs`, `/api/human-coupon-settlements` and `/api/human-sources` to strict bounded JSON reads after their existing bearer-authentication and method checks. Per-route caps are documented above in the Stage 2 request-boundary audit.


### Extended bounded JSON coverage for worker and diagnostics APIs (2026-11-06)
- Extended the shared strict JSON parser to 11 more authenticated write routes: AI budget approval, department smoke test, OpenAI key diagnostics, tipster source import, tip submission, research evidence submission, research-source candidate review, post-match check, simulation execution, simulation creation and worker execution.
- Added route-specific byte caps: AI budget 8 KiB; department smoke test 8 KiB; OpenAI key diagnostics 8 KiB; source import 64 KiB; tips 16 KiB; research evidence 128 KiB; source-candidate review 8 KiB; post-match check 8 KiB; simulation runner 8 KiB; simulation creation 64 KiB; worker runner 16 KiB.
- The internal simulation and worker runners now require POST in addition to their existing internal bearer token. All 16 covered routes authenticate before parsing request bodies.
- Extended the architecture gate to enumerate all 16 routes, verify their configured caps and authentication ordering, and require POST on the internal runners.


- A further pass extended the shared bounded parser to AI-budget unlock, department smoke test, OpenAI key diagnostics, source imports, tips, research evidence, source-candidate review, post-match check, simulation runner, simulation creation and worker runner. The architecture gate now enumerates all 16 routes and checks their exact per-route limits plus authentication-before-body ordering.


## 11. Follow-up request-boundary audit — OAuth, owner controls and remaining write routes (2026-11-06)

A focused source review of the current PR tree checked the OAuth handlers, owner-approval control plane, result submission, scheduled scout runner and the 16 routes using the shared bounded JSON parser.

### OAuth endpoints

- `/oauth/register` is POST-only and uses the shared OAuth JSON reader before processing dynamic client registration. Redirect URIs are bounded and restricted to the supported ChatGPT HTTPS callback patterns or native loopback callback patterns; optional grant/response-type declarations are validated.
- `/oauth/authorize` accepts GET for the authorization request and POST for the owner-consent form. The POST form contains the owner token, so it must be read before token validation; it is URL-encoded and capped by the OAuth form parser. The transaction is then checked, the owner token is validated, and the request record is consumed with its stored ETag. Concurrent submissions return only the winning committed authorization code.
- `/oauth/token` is POST-only and accepts bounded URL-encoded form data. Authorization-code and refresh-token records are validated and consumed with compare-and-swap before a token pair is issued.
- These routes declare per-IP Netlify rate limits in source. This audit does not prove deployed rate-limit enforcement or a live OAuth round-trip.

### Other bounded control-plane handlers

- `/api/ml-owner-approval` checks POST and its dedicated owner bearer credential before reading the bounded JSON body. The trusted public key and reviewer identity come only from protected environment configuration; request JSON cannot supply them.
- `/api/results` checks its method and owner authorization before using its dedicated bounded JSON parser. The endpoint remains subject to the separate immutable-claim/correction design documented above.
- `scheduled-scout-runner.mts` authenticates the internal bearer token before parsing its bounded POST body. The per-run execution lease is acquired only after the run exists and the completion check has passed.
- The shared parser validates the declared and streamed byte limits, strict UTF-8, exact JSON media type, JSON syntax and object shape. Its configured maximum is itself bounded to 1 byte–1 MiB.

### 16 shared-parser route coverage

The 16 authenticated write routes are: `/api/runs`, `/api/library`, `/api/learning-data-jobs`, `/api/human-coupon-settlements`, `/api/human-sources`, `/api/ai-budget`, `/api/department-smoke-test`, `/api/openai-key-check`, `/api/sources`, `/api/tips`, `/api/research-data`, `/api/research-source-candidates`, `/api/post-match-check`, `/api/simulation-runner`, `/api/simulations` and `/api/worker-runner`.

For each route, the existing authentication check precedes body parsing. The internal simulation and worker runners additionally require POST. Route-specific byte limits are enforced by the shared helper and asserted by the architecture quality gate. The source review does not establish that every business-level operation is race-free or that every endpoint has received a complete authorization, CORS, schema and side-effect review.

### Open issues retained

- Provider-side atomicity for Netlify Blobs conditional writes remains unverified; current race tests use isolated in-memory adapters.
- The scheduled-run lease has no heartbeat. A run exceeding its lease could require renewal before heavier workloads are allowed.
- OAuth provider compatibility, callback behavior and deployed rate-limit enforcement remain unverified.
- Duplicate-submission races in human settlement and lesson-review submission paths deserve a separate idempotency review; bounded request parsing does not make those multi-write workflows atomic.
- The source inventory is not a live deployment or schedule-health report. No production function, OAuth flow, scheduled job or provider was invoked during this pass.

This follow-up is a source review and documentation update only. It does not claim tests or build execution for the current PR head.


### Human settlement submission idempotency (2026-11-06)
- Replaced the list-then-write duplicate check in `/api/human-coupon-settlements` with a deterministic SHA-256 identity over the same coupon ID, evidence URL and claimed outcome tuple.
- The endpoint now claims the case with `putIfNew`. Concurrent identical submissions converge on one stored case; retries return that existing case with `duplicate: true`. A conflicting or unreadable occupied identity fails closed with HTTP 409.
- Added regression coverage for deterministic identity and separation across coupon, evidence and outcome values. The test is required by the build and the atomic create-once wiring is checked by an architecture quality gate.
- This closes the duplicate POST race for identical human-settlement claims. It does not make independent-review processing atomic, prove provider-side Blobs semantics, or convert submitted claims into verified outcomes.


### Lesson-review submission concurrency follow-up (2026-11-06)
- Replaced the `/api/library` lesson-review list-then-write duplicate scan with a deterministic SHA-256 case ID derived from the lesson's validation revision (lesson ID, validation status, prior review-case ID, update timestamp and validation timestamp).
- Identical submissions against the same lesson revision now use `putIfNew` to converge on one pending review case. The lesson's pointer/status update uses `putIfMatch` against the original ETag.
- A retry after a case was claimed but before the lesson pointer was updated reuses the same case ID and can complete the pointer update. If the lesson changes concurrently, the handler returns HTTP 409 rather than overwriting the newer lesson state.
- If the lesson already says pending, the handler follows its stored case pointer and verifies the referenced case; a missing or inconsistent pointer fails closed for manual reconciliation.
- Rejection changes the lesson validation status, so a later resubmission derives a different case ID. Tests cover deterministic identity and changed/rejected revision separation; build and architecture quality gate require these tests and the atomic route wiring.
- This is not a multi-record transaction. A storage failure after case creation can leave a pending case whose lesson pointer needs retry/reconciliation. Provider-side Netlify Blobs conditional-write guarantees remain unverified by the isolated test fixtures.

### Independent-review partial-write recovery regression (2026-11-06)

- Added `scripts/independent-review-recovery.test.mjs` for the human-coupon approval path.
- The isolated fixture injects a storage failure after the coupon and its winning-outcome projection have been written, but before the settlement-learning projection is complete.
- It then simulates expiry of the in-progress review lease and retries the exact same reviewer submission.
- The regression requires the retry to recognize the already-applied coupon outcome, finish the missing learning projection, mark the review case and operation completed, and retain one canonical history/lesson/settlement-learning record after a further identical retry.
- The test writes only synthetic records through the explicitly enabled in-memory adapter. It does not establish provider-side Netlify Blobs conditional-write behavior.
- The test is registered in the build-required file list and a source-level architecture gate checks that the recovery assertions remain present.
- This is newly added test coverage; no execution result is claimed for the current PR head. The review remains a sequence of single-record writes, not a multi-record transaction. If the process fails at another boundary, exact-payload retry after lease expiry remains the recovery mechanism.

### WIN-origin coupon settlement claim and retry recovery (2026-11-06)

- `settleCouponRecord` now creates one immutable claim per coupon under `library/coupon-settlement-claims/`, using `putIfNew` and a SHA-256 fingerprint over the coupon ID, outcome, settlement source and evidence payload.
- The claim stores the complete settlement payload and timestamp. An identical retry reuses that exact claim and can repair missing coupon projections, history and learning records after an interrupted write.
- Settlement history now has a deterministic per-coupon identity, preventing duplicate history rows on retries. Existing stable lesson, settlement-learning, agent-observation and agent-profile identities are retained.
- A different outcome, changed evidence payload, or previously settled legacy coupon without a matching immutable claim fails closed. This preserves the original outcome until a dedicated correction workflow is implemented.
- Added `scripts/library-settlement-recovery.test.mjs` for an injected failure after the first learning write, retry recovery, duplicate-history prevention, conflicting-outcome rejection and legacy-record fail-closed behavior. Registered it in the build-required files and architecture quality gates.
- The test uses synthetic records and the isolated in-memory adapter. It does not prove provider-side Netlify Blobs atomicity, and no current-head test/build execution is claimed.

### Review of uploaded `coupon_ai_v2.zip` and point-in-time chronology follow-up (2026-11-06)

- Inspected the ZIP source, tests, README, dependency manifests and workflow. The project contains a market-anchored log-linear ensemble (Dixon-Coles scoreline model, gradient-boosted classifier, optional PyTorch MLP and sharp-book probabilities), multi-market scoreline derivation, walk-forward backtesting, calibration/log-loss/CLV reporting, a coupon meta-model, Thompson-sampling strategy selection and fractional-Kelly/round exposure caps.
- Executed the ZIP's own test suite in an isolated temporary extraction: **20 tests passed**. This is evidence only that its included synthetic/unit tests pass in this environment; it is not evidence of predictive edge, live-data validity, licensing, production readiness or safe betting.
- Did not import the ZIP's code, model files or data into WIN. Key limitations identified: accumulator probability is the product of leg probabilities and assumes cross-match independence; its feature builder has only date-level ordering rather than source-confirmed result availability; arbitrary `x_` features have no timestamp/provenance enforcement; the coupon meta-model/bandit need stronger chronological validation and provenance; SQLite settlement rows do not meet WIN's immutable evidence contracts.
- Reusable research ideas are limited to: market-anchored log-pooling of genuinely out-of-fold member probabilities, scoreline-derived market consistency, Dixon-Coles low-score correction, probability calibration/disagreement diagnostics, and walk-forward evaluation with closing-line comparisons. Any future adaptation must retain WIN's data licensing, result-availability, held-out evaluation, independent-review, low-risk and NO BET gates.
- Cross-checked WIN's current point-in-time feature builder against the ZIP's date-ordering weakness. WIN already requires precise event kickoff and source-recorded `resultAvailableAt` before each prediction cutoff. Added an additional fail-closed exclusion for impossible source timestamps where `resultAvailableAt < kickoff`.
- Added a same-day regression covering an earlier completed match, a later same-day match unavailable at the target cutoff, and an impossible pre-kickoff availability timestamp. Registered its assertions in the architecture quality gate.
- The ZIP's 20 tests were executed. The newly modified WIN tests and current PR head have **not** been executed or CI-verified here; the isolated in-memory adapter still does not establish provider-side Netlify Blobs guarantees.

### Research-only market-anchored ML probability blend (2026-11-06)

- Added `netlify/lib/ml-market-anchored-blend.mts`, a pure single-event football 1X2 research helper. It removes bookmaker overround from decimal odds and uses a logarithmic pool to combine the market prior with an ML probability vector.
- The ML contribution is zero unless the supplied evaluation evidence says the model beats the market on **both** held-out log loss and Brier score, has ECE no greater than 0.05, has at least 100 held-out rows, uses matching model/market test-cohort hashes, and was evaluated only after all test labels were available.
- If the evidence gates pass, the model weight scales with the smaller of the two relative score improvements and is capped at 20%. The market remains the dominant anchor.
- Per-event safeguards require the market and model prediction to refer to the same event, both timestamps at or before the prediction cutoff, model training before that cutoff, and a market snapshot no older than six hours. Decimal odds and implied overround are bounded; impossible calendar timestamps are rejected.
- The output includes source/snapshot/model/evaluation/cohort hashes and an evidence digest. It is explicitly `research_only`; production use and automated betting remain false. It is not a coupon builder and does not assume independent match outcomes.
- Added `scripts/ml-market-anchored-blend.test.mjs` for positive research-only calculation, 20% maximum model influence, non-improving model rejection, cohort/sample mismatch, stale/future timestamps, calibration, evaluation chronology, invalid odds/probabilities, overround and invalid dates. Registered the module/test in `scripts/build.mjs` and the source-level architecture gate.
- **Important limitation:** this pure helper does not itself fetch or cryptographically verify the immutable model-evaluation and market-evaluation records named in its input. A future integration must load those records from WIN's verified registries and establish that both metrics were computed on exactly the same held-out event set before calling it. No live market feed, real model, production route, provider or betting action was enabled. Current-head WIN tests/build remain unverified.
- Additional numerical guards require normalized model probabilities, finite evaluation metrics within multiclass Brier/log-loss bounds, and a plausible implied market overround. Invalid probability vectors or impossible metric values return a blocked result with no blended probabilities.
