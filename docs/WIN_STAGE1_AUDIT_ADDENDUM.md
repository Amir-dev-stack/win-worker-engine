# WIN Stage 1 — audit addendum (2026-11-05)

Status: partial, read-only verification against the combined PR #10 head. This addendum records additional code-level findings. It does not authorize production changes, data migration, merges, deployments, or paid services.

## Baseline

- Repository: `Amir-dev-stack/win-worker-engine`
- Inspected combined baseline: PR #10, branch `feature/free-statsbomb-research-integration`, head `17dc194392de8ff4458dcd18a036d6dde99f315b` (verify current head before implementation).
- Stage 1 tracking PR: #11, branch `docs/win-staged-build-roadmap`.
- Existing PRs #8, #9 and #10 remain separate and unmerged.

## Newly verified findings

### 1. Memory ownership lists are duplicated

The same 23 structured-memory prefixes are independently declared in:
- `netlify/lib/store.mts` — `MIRRORED_MEMORY_PREFIXES`
- `netlify/functions/neon-memory-backup.mts` — `PREFIXES`
- `netlify/functions/memory-backfill.mts` — `PREFIXES`
- `netlify/functions/memory-restore.mts` — `PREFIXES`

The inspected lists currently match. This is a maintenance-drift risk, not evidence of current data loss. Do not simply broaden the Neon allowlist: the library exposes additional collections that are intentionally or not-yet-classified as non-mirrored.

Safe direction: introduce one diagnostic collection ownership manifest and contract tests that compare the four current lists. Only after reviewing every collection and its writer/reader should a later change derive the lists from one source. Preserve current backend selection and all data.

### 2. The library has a broader collection surface than the Neon allowlist

The library registry includes structured operational records and model-lab datasets, including:
- coupons, coupon outcomes/history and coupon research cases;
- frozen predictions, settled results and other settlements;
- agent profiles, persistent profiles, observations, notes, tasks, proposals and sandbox evaluations;
- entity profiles, lessons, lesson review cases and settlement learning;
- research runs, research evidence/source candidates/source discovery runs and human tips;
- model-lab historical event, market consensus, observed market, settled market, player event and player-season aggregate datasets;
- calibration reports, settlement runs, learning cycles, strategy candidates and backtests.

These categories do not all have the same retention, size, sensitivity, provenance or relational-query requirements. A collection's presence in the dashboard library is not sufficient reason to mirror it into Neon. Each collection needs an explicit owner, writer, reader, size/retention policy, backup treatment and migration classification.

### 3. Direct storage access must remain visible in the ownership map

Confirmed direct Netlify Blobs paths include:
- shared `netlify/lib/store.mts` adapter: `win-engine`;
- AI budget ledger/lock: direct `win-engine` access in `netlify/lib/ai-budget.mts`;
- OAuth records: direct `win-oauth` access in `netlify/lib/oauth-store.mts`;
- Neon memory backup, backfill and restore routes: direct access to `win-engine` for snapshots, manifests, locks and progress state.

The AI budget controller uses its own lock/ledger protocol and has an internal stop threshold. Do not route it through a new generic store or alter its spending limits as part of a collection-registry refactor. OAuth has a separate store name and token-consumption semantics; do not merge it into the general library namespace.

### 4. Result submission is not atomically unique

In `netlify/functions/results.mts`, the endpoint:
- authenticates the request and validates supported outcomes and HTTPS evidence;
- requires an existing prediction;
- searches up to 500 result records for the prediction;
- writes the result and then several learning/settlement records.

The bounded read-before-write check is not an atomic uniqueness claim. The multi-record writes can also partially complete if a later write fails. The stable learning-case key helps retries but does not make the whole operation transactional.

Safe direction:
- add isolated tests for concurrent duplicate submissions, same-outcome retries, conflicting outcomes, and failures injected after each write;
- design an idempotency claim keyed by prediction/settlement identity using conditional storage semantics;
- make the learning projection resumable/reconcilable and report partial status honestly;
- preserve independent-review status and correction workflow.

Do not change production result behavior until the tests and recovery design are reviewed.

### 5. Scheduled jobs and monitoring already exist

The combined PR #10 code includes:
- scheduled intensive-learning orchestration in the hourly monitor;
- scheduled scout execution and worker execution routes;
- post-match check/follow-up/runner routes;
- memory capacity monitoring;
- scheduled encrypted Neon backup (03:23 UTC);
- health and AI budget reporting.

These existing jobs need a full trigger, authentication, timeout, retry, lock, stale-job, idempotency and heartbeat inventory. Do not add a second cron scheduler before that inventory is complete. A scheduled endpoint existing in code does not prove its production schedule is active or its last execution succeeded.

### 6. Backup and restore safeguards are already substantial

The Neon backup route:
- uses an ETag/conditional-write lock;
- exports only the declared structured-memory prefixes plus financial account/ledger records;
- applies row and byte limits;
- hashes content, compresses it and encrypts it with AES-256-GCM;
- stores a manifest and applies 30-day retention.

Backfill requires authenticated explicit confirmation and mirror mode, inventories source/target keys, verifies per-record hashes and collection digests, and writes a completion manifest. Restore requires authenticated explicit confirmation and mirror mode, verifies manifest/size/hash/authentication/decompression/row count, restricts keys to approved prefixes and restores only into Neon.

Code inspection is not a restore drill. No production backup, backfill, restore, or data write was run during this audit. The next safe test is a synthetic isolated round trip using test-only credentials/storage and explicit cleanup.

## Stage 1 remaining work

- [ ] Inventory every direct `@netlify/blobs` import and every direct `getStore` call across the combined PR #10 tree.
- [ ] Map all API routes, methods, request/response schemas, auth scopes and side effects.
- [ ] Map every scheduled trigger, job state, lock, retry, timeout and heartbeat; distinguish configured schedules from verified live execution.
- [ ] Reconcile every library collection with store, backfill, backup and restore ownership.
- [ ] Trace prediction freeze IDs/evidence snapshots/model versions and separate recommendations from confirmed actual wagers.
- [ ] Review model-lab feature generation, model training, chronological splits, calibration and reproducibility; label implemented versus unvalidated.
- [ ] Map agent roles and actual FOR/AGAINST and Master decision gates.
- [ ] Run isolated backup/restore and failure-injection tests only after the test harness is confirmed isolated.
- [ ] Complete environment-variable name inventory without retrieving or exposing secret values.
- [ ] Complete CI/test coverage matrix and record skipped checks as skipped.

## Stage 2 entry gate

Do not begin a production-facing storage refactor until the Stage 1 collection ownership matrix and route/job inventory are complete. Stage 2 may begin with isolated contract tests and a diagnostic manifest only. The first code change should not alter backend routing, prefix membership, data, schedules, credentials or production settings.

## Safety

- No application code or production configuration changed during this audit.
- No production data was read or written through runtime APIs.
- No secrets or secret values were retrieved.
- No backfill, restore, migration, paid provider activation, PR merge or production deployment was performed.
