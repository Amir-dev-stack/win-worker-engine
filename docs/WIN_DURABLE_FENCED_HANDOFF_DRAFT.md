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
5. Never derive worker identity, authorization, model quota or Free-plan price from untrusted model output or HTTP JSON. A *trusted independently authenticated* server maps provider identity to DB actor and separates administrative task approval from worker mutation rights.
6. Keep `checkpoint_commit_sha` restricted to a reviewed, secret-scanned draft commit; do not store prompts, source files, private keys, tokens or arbitrary assistant messages in the lease database. Source GitHub SHA must be verified by the trusted host before enqueuing.
7. The DB schema is a draft for Neon. Do not apply, create credentials, change billing, or grant access without separate independent security review and explicit owner authorization. PostgreSQL-specific CI tests under an actual database and concurrent worker stress tests are still necessary.

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

## Next acceptance gates
- Independent review of the proposed schema, least-privilege database permissions and status transitions.
- Provision or reuse a trusted durable store **without touching production**. Confirm API credentials, quotas, owner approval and limits separately.
- Add transaction-level concurrent claim, expiration, stale owner and crash/restart tests against isolated PostgreSQL.
- Build an independently authenticated scheduler and git reader with approval-bound source SHA, lease checks and exact-head draft writes.
- Confirm Cloudflare model account is truly Free-plan and approved for processing bounded private code; never infer zero spend from a caller-supplied boolean.
- Demonstrate PC-off/return path: Codex primary lease ends, reviewer claims a valid task, proposal is independently validated, Codex later resumes without duplicate execution.

No model request, Cloudflare call, payment, database migration or deployment is triggered by these files.
