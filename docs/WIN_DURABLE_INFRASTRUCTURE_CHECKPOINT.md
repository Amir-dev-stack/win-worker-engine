# WIN durable infrastructure checkpoint

Updated 2026-11-26. This draft is additive and does not apply a production migration.

## Provider evaluation

- Neon read-only inspection found project `win-memory` (`little-feather-51279997`)
  with a protected production branch and disposable branches
  `win-memory-schema-test` and `win-pg-isolated-validation-20261117`.
- The isolated branch exposes `win_memory_records` with an opaque `etag` and
  conditional-write-compatible key structure. The production branch was not
  written or queried for application data.
- Supabase project discovery returned no projects. No credentials or secrets
  were requested.

## Disposable provider verification — 2026-11-26

- Created the short-lived child branch `win-pr112-validation-20261126`
  (`br-proud-poetry-bayjofp7`) from the existing disposable validation branch
  `win-pg-isolated-validation-20261117` in project `win-memory`
  (`little-feather-51279997`). It was configured to expire at
  `2026-11-26T18:00:00Z`; the production branch was not used.
- Applied the draft queue and receipt tables only on that child branch. The
  draft adapter schema was not applied to production and no application
  credentials or connection string were retrieved.
- Two independent Neon SQL sessions attempted the same queued claim: exactly
  one returned the task with fence `1`; the other returned no row.
- A checkpoint write returned the expected commit SHA, a subsequent read
  observed it, and renewal after an explicitly expired lease returned no row.
- A receipt insert on the child branch returned one row; a duplicate operation
  insert with a different result SHA returned no row and the original receipt
  remained unchanged. This verifies the draft table's unique operation key and
  conflict-preserving insert shape, not an end-to-end effect sink.
- The Neon connector could not expose or terminate the transaction backend, so
  process-termination rollback remains separately evidenced only by the
  opt-in local PostgreSQL script below.

## Draft implementation

`db/draft_win_durable_task_queue.sql` defines a queue and receipt schema for a
disposable Postgres branch. `scripts/win-durable-queue-adapter.mjs` provides
parameterized atomic claim, renewal, checkpoint and quarantine statements with
input and result-shape validation. The adapter has no network or database
connection by itself.

The adapter, supervisor lifecycle, scheduler and failure-injection suite pass
18/18 locally. The opt-in PostgreSQL 16 validation script passes at commit
`1e2efb39fadc259cc1d0e79458ce2faf5ce5cdcb` against an isolated local
container. It exercises two concurrent claimers, stale lease rejection,
checkpoint persistence, and rollback after terminating an in-flight transaction.
Coverage
includes parameterized CAS statements, malformed-result rejection, checkpoint
preservation, usage-limit routing, reset gating, lease-expiry takeover,
concurrent claim serialization, duplicate-handover prevention, scheduler
interruption recovery and PostgreSQL bigint-fence normalization. These are
injected-component tests; they are not distributed Postgres evidence.

## Completion matrix

| Area | Status | Evidence / limitation |
| --- | --- | --- |
| Durable queue schema | VERIFIED (disposable branch) | Draft SQL applied only to expiring Neon child branch `br-proud-poetry-bayjofp7`; no production migration. |
| Atomic claim and fencing | VERIFIED (disposable branch) | Two independent Neon sessions produced one claim winner and one empty result; stale renewal returned no row. |
| Durable checkpoints | VERIFIED (disposable branch) | Neon checkpoint write and subsequent read preserved the commit SHA. |
| Idempotent receipts | VERIFIED (disposable branch) | Unique operation receipt insert returned once; conflicting duplicate was ignored and the original row persisted. Effect-sink integration remains pending. |
| Crash/interruption recovery | IN PROGRESS | Local process termination rolls back an interrupted transaction; provider-backed crash recovery remains pending. |
| Supervisor and scheduler integration | IN PROGRESS | Bounded lifecycle and persistent checkpoint scheduler pass 17/17 locally; durable cross-worker state still pending. |
| Neon | VERIFIED (disposable validation) | Expiring child branch used for schema and queue evidence; production untouched. |
| Supabase | VERIFIED (no project available) | Discovery returned an empty project list. |
| Production safety | VERIFIED | No production query, migration, credential access, paid operation or deployment performed. |

The A01, A02, B1, B2, B4 and A20 gates remain open. This checkpoint does not
prove cloud execution or authorize production database changes.
