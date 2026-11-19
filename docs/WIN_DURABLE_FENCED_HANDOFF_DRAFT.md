# WIN persistent fenced handoff contract — offline draft

This is a **proposal**, not a deployed Neon/Postgres migration, authorized scheduler, or proven PC-off backup. It complements the existing read-only backup reviewer (draft PR #71), and intentionally **does not duplicate** the production cloud runner.

## Problem addressed
A local-only, single-use JS review envelope prevents duplicates inside one process, but cannot coordinate Cloudflare, Codex, another host or another server instance. The trusted supervisor must use an atomic database CAS to enforce one current lease and an ever-increasing fencing generation.

## Draft components
- `db/draft_win_dev_fenced_lease.sql`: an unapplied Postgres table with constrained task identifiers, preapproved source commit SHA, read-only/draft task type, forced no production write/no paid spend, lease owner, integer fencing generation, expiration and opaque **commit SHA only** checkpoints. It revokes PUBLIC privileges.
- `scripts/win-development-lease-store.mjs`: parameterized SQL for preapproved queued task claim, lease renewal, checkpoint SHA, completion and expired-lease quarantine.
- `scripts/win-development-lease-store.test.mjs`: offline/mock contract tests. They are **not an actual concurrent PostgreSQL transaction test**.

## Essential invariants
1. **No auto reclaim of an expired running coding task.** The supervisor atomically marks it `blocked_uncertain` and increments the fence. That condition stays blocked until a separate trusted reconciliation verifies the former job is no longer executing and checks its last GitHub/checkpoint effects. No automatic blind model retry.
2. Claim works only for a preapproved `queued` task with no current owner; one SQL UPDATE executes atomically in Postgres, and a zero-row result means no lease was obtained.
3. Every subsequent renew, checkpoint or complete operation compares both authenticated worker ID and exact fence, and requires an unexpired lease. A stale worker is unable to change the DB row even if it resumes execution.
4. A DB fence is **not enough to stop external writes**. Every GitHub draft-branch update must also use an authenticated exact-head compare-and-swap, after rechecking the DB lease. Production deployment, merges, paid model calls and secret access are prohibited. No GitHub writer is implemented in this proposal.
5. A GitHub mutation requires an authoritative `draft_only_development` lease. A `read_only_review` lease cannot authorize a branch update. The first proposed commit must have `source_commit_sha` as its sole parent. Later proposed commits must have the lease's current `checkpoint_commit_sha` as their sole parent while the original `source_commit_sha` remains unchanged. Missing, malformed or mismatched ancestry stops before a write.
6. Never derive worker identity, authorization, model quota or Free-plan price from untrusted model output or HTTP JSON. A *trusted independently authenticated* server maps provider identity to DB actor and separates administrative task approval from worker mutation rights.
7. Keep `checkpoint_commit_sha` restricted to a reviewed, secret-scanned draft commit; do not store prompts, source files, private keys, tokens or arbitrary assistant messages in the lease database. Source GitHub SHA must be verified by the trusted host before enqueuing.
8. The DB schema is a draft for Neon. Do not apply, create credentials, change billing, or grant access without separate independent security review and explicit owner authorization. PostgreSQL-specific CI tests under an actual database and concurrent worker stress tests are still necessary.

## Database response validation (2026-11-19)

The adapter now validates each affected row **after** checking that exactly one row was returned. A zero-row update still means no lease / lost compare-and-swap. A one-row response is not automatically accepted: it must identify the requested task; a claim must include a well-formed original source SHA, supported task type, valid lease expiry, safe positive fencing generation and valid optional checkpoint SHA. Renew/checkpoint/complete must return exactly the requested fence, and checkpoint/terminal results must match the intended SHA/status. PostgreSQL drivers may return bigint fences as decimal strings; they are accepted only when safely representable as JS integers. Missing, mismatched, malformed or unsafe values fail closed with `INVALID_DATABASE_RESULT`.

These checks protect the **application adapter** against inconsistent or malformed driver results and prevent false success claims. They do **not** authenticate the database, prove the actor owns its identity, establish a real distributed lease, prevent a rogue caller from bypassing the adapter, or replace database transactional/concurrency tests. Real PostgreSQL sessions and least-privilege role validation remain essential before deployment.

## Optional real local PostgreSQL concurrency test

Added `scripts/win-development-lease-postgres.integration.test.mjs`. It is **skipped in ordinary CI**. Running it requires `psql`, a separately created **local-only test database** whose name starts with `win_lease_test_`, a PostgreSQL URL pointing only to `localhost` or `127.0.0.1` port 5432, and explicit `WIN_LEASE_LOCAL_PG_TEST=run`. The test creates a random temporary schema inside that local test DB, executes the draft DDL and runs two competing `psql` claim sessions; it expects exactly one winner. It then expires the lease, verifies no automatic takeover or stale-worker renewal, quarantines the task, and ensures a stale fence cannot complete. Its generated test schema is cleaned up in a `finally` block.

Example for a **separately provisioned local disposable PostgreSQL**, never a Neon or production URL:

```powershell
$env:WIN_LEASE_LOCAL_PG_TEST = 'run'
$env:WIN_LEASE_TEST_DATABASE_URL = 'postgresql://local_test_user:local_test_password@127.0.0.1:5432/win_lease_test_sandbox'
node --test scripts/win-development-lease-postgres.integration.test.mjs
Remove-Item Env:WIN_LEASE_TEST_DATABASE_URL
Remove-Item Env:WIN_LEASE_LOCAL_PG_TEST
```

The URL above is an **illustrative dummy**, not a real credential. Do not commit or print real passwords. Normal CI may include a skipped result and does **not** prove PostgreSQL concurrency has been run. No database or provider connection was made while adding this test. The script only exercises a database that was already supplied locally; it does not create projects, purchase capacity or apply migrations in Neon.

Fencing counter arithmetic is now explicitly bounded to JavaScript's maximum safe integer at the table and claim/quarantine levels. An exhausted counter cannot be silently wrapped or interpreted imprecisely; claim/quarantine then update zero rows and require manual reconciliation.

## Approval-revocation gate (2026-11-19)

The current draft CAS statements now require `approved = true` not just when acquiring the task but also when **renewing, checkpointing and completing** an active lease. If a trusted supervisor revokes approval during a running task, those DB operations will affect zero rows, and the caller must stop without treating the write as successful. Expired leases may still be quarantined without renewed approval, because quarantining is a safety action, not permission to continue work.

Regression tests check all three SQL guards. The optional local PostgreSQL test adds an active-lease revocation scenario; it is **not run in ordinary CI** and remains unverified against real Postgres. Note that the database gate cannot revoke an already executing external model call or a separately authorized GitHub credential. A trusted worker must check the approval and fence again immediately before any external side effect and use GitHub exact-head CAS where writes are allowed. No automatically retried uncertain requests.

## Local Postgres connection isolation (2026-11-19)

The opt-in real PostgreSQL harness was audited for inherited `libpq` environment settings. It now imports `inspectLocalPgConfig` from `scripts/win-development-lease-pg-config.mjs`, validates the explicit localhost/127.0.0.1 test-only URL, and strips inherited `PG*`, `DATABASE_URL` and test destination variables before creating the `psql` subprocess. It explicitly clears `PGHOSTADDR`, `PGSERVICE`, `PGOPTIONS` and inherited passfile lookup. This closes a risk where `PGHOSTADDR` could override a localhost hostname. A separate offline regression file covers remote destinations, port/query-string injections, test-only database names, and inherited libpq settings; it never opens a connection.

The actual concurrent PostgreSQL integration test is still opt-in and **skipped by default**, and remains unverified without an isolated local PostgreSQL service. The connection validator limits accidental destination misrouting; it is not a protection against a malicious local host or compromised process.

## Actual disposable PostgreSQL concurrency verification — 2026-11-19

The previously opt-in concurrency test **has now passed against a real isolated PostgreSQL 16 server** started as a disposable GitHub Actions service for **draft PR #72 only**. The workflow uses synthetic test credentials, a `win_lease_test_ci` local database, and a generated temporary schema. It performs real SQL transactions using independent `psql` processes. The exact reviewed code commit is `8c2909eb275133683cdcbdd1bdec57f20660010c`.

- [Real PostgreSQL integration run 44494006362](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44494006362): **SUCCESS**, 1/1 live integration test passed, 0 skipped. The test checks two competing claims (exactly one winner), active-lease approval revocation (renew/checkpoint/complete denied), lease expiry, no third-party steal, quarantining the uncertain lease and rejection of the stale prior fence.
- [Normal WIN validation run 44494006382](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44494006382): **SUCCESS**; architecture/build, ordinary Node tests, quality gates and function bundling passed. Its ordinary Node suite still skips the optional integration test because it runs only in the dedicated PostgreSQL-service job.
- The first dedicated PostgreSQL run failed on connection configuration, not the lease SQL. A fixed, credential-safe diagnostic step verified disposable service connectivity, and the harness now **removes** inherited libpq routing variables rather than setting them to empty strings. The corrected run passed.
- Workflow `.github/workflows/win-lease-postgres-integration.yml` is scoped to pull request #72 targeting the draft base and selected database files. It has `contents: read` permissions, an 8-minute timeout and no real Neon or Cloudflare credentials.

**This is real PostgreSQL concurrency evidence in a disposable CI environment**, not proof of production database permissions, a multi-host crash recovery protocol, cryptographic agent authentication or an automatic PC-off development task. No Neon migration, persistent task supervisor, Cloudflare activation or GitHub draft writer was deployed. An independent review and broader fault-injection tests remain required before any live rollout.

## GitHub draft-only CAS boundary — 2026-11-19

`scripts/win-github-draft-cas.mjs` adds a dependency-injected **fail-closed write gate**, with offline tests in `scripts/win-github-draft-cas.test.mjs`. It requires an approved task, exact source and proposed commit SHAs, a `win-draft/*` branch, bounded non-sensitive changed-file paths, and a verified current lease owner and fencing epoch. It rejects production/main/release branches, suspicious paths, expired/revoked leases and a changed GitHub branch head. The gate rechecks the lease immediately before one write attempt, and never automatically retries uncertain GitHub outcomes. It can only call an injected `git.updateHeadIfEquals` adapter that declares it implements **server-side atomic expected-head compare-and-swap**. Mock tests check these safety rules.

**Critical limit:** There is **no real GitHub branch mutation adapter or authenticated cloud supervisor wired into this module**. A caller-supplied `atomicCompareAndSwapVerified` flag is an interface assertion, not cryptographic proof or enforceable GitHub atomicity. A real host must independently validate the adapter and GitHub permissions, approved commit ancestry, path policy and secret scanning. A preflight DB lease check and subsequent GitHub CAS cannot by themselves create an atomic cross-service transaction, so external side-effect/revocation races and crash recovery still require a trusted reconciliation protocol. The module is not currently used to make any live writes, and nobody should treat a mocked passing test as proof of a production-ready cloud writer.

## Proposed Git commit inspection before any draft update (2026-11-19)

The draft write policy now requires an injected **trusted Git commit inspector**, `git.inspectProposedCommit(repository, proposedSha)`, before attempting a draft branch update. It must return verified metadata fetched from the trusted repository, not from an LLM or user-supplied object. The guard checks that the proposed commit is exactly the requested SHA, has **one and only one parent equal to the current expected branch head** (rejecting merges and unrelated commits), has a changed-file list exactly matching the approved path set with no extra, duplicate or unsafe path, and carries independently verified `secretScanPassed` and `sourceVerified` attestations. Missing, malformed or inconsistent metadata blocks any GitHub write attempt.

The booleans are **interface attestations only**: this standalone code cannot prove that a real scanner ran, that metadata was cryptographically authenticated or that a host's GitHub update implements atomic expected-head compare-and-swap. A real external GitHub integration and scanner must be independently implemented and verified, with adversarial source tests, least-privilege credentials and zero-permission-to-merge/deploy. Passing mocked commit-inspection tests does not permit automatic production writes.

## Asynchronous draft-request mutation defense (2026-11-19)

The GitHub draft CAS gate now **copies and freezes the complete validated write request (including a separate copy of its changed-path list) before any database or GitHub `await`**. This closes a time-of-check/time-of-use problem: previously an injected caller could mutate the original `request.branch`, `request.proposedCommit` or `request.paths` while the guard waited for lease/head/commit inspection, potentially redirecting the actual write away from the validated parameters. A new controlled concurrency regression test pauses the first async lease read, mutates every sensitive original request field, then resumes and confirms the only permitted write still uses the original approved draft branch/commit/task/fence/file set.

This is a *local input integrity* safeguard, not proof of a trusted live GitHub adapter, secret scanner, authenticated worker identity or atomic GitHub/Neon cross-service operation. The live writer remains unconnected and no unattended cloud task is enabled.

## Next acceptance gates
- Independent review of the proposed schema, least-privilege database permissions and status transitions.
- Provision or reuse a trusted durable store **without touching production**. Confirm API credentials, quotas, owner approval and limits separately.
- Add transaction-level concurrent claim, expiration, stale owner and crash/restart tests against isolated PostgreSQL.
- Build an independently authenticated scheduler and git reader with approval-bound source SHA, lease checks and exact-head draft writes.
- Confirm Cloudflare model account is truly Free-plan and approved for processing bounded private code; never infer zero spend from a caller-supplied boolean.
- Demonstrate PC-off/return path: Codex primary lease ends, reviewer claims a valid task, proposal is independently validated, Codex later resumes without duplicate execution.

No model request, Cloudflare call, payment, database migration or deployment is triggered by these files.
