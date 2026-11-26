# WIN durable infrastructure checkpoint

Updated 2026-11-26. This draft is additive and does not apply a migration.

## Provider evaluation

- Neon read-only inspection found project `win-memory` (`little-feather-51279997`)
  with a protected production branch and disposable branches
  `win-memory-schema-test` and `win-pg-isolated-validation-20261117`.
- The isolated branch exposes `win_memory_records` with an opaque `etag` and
  conditional-write-compatible key structure. The production branch was not
  written or queried for application data.
- Supabase project discovery returned no projects. No credentials or secrets
  were requested.

## Draft implementation

`db/draft_win_durable_task_queue.sql` defines a queue and receipt schema for a
disposable Postgres branch. `scripts/win-durable-queue-adapter.mjs` provides
parameterized atomic claim, renewal, checkpoint and quarantine statements with
input and result-shape validation. The adapter has no network or database
connection by itself.

The adapter, supervisor lifecycle, scheduler and failure-injection suite pass
17/17 locally at commit `a1e37c736a492d18d0b4152eb5fe519d91fef515`. Coverage
includes parameterized CAS statements, malformed-result rejection, checkpoint
preservation, usage-limit routing, reset gating, lease-expiry takeover,
concurrent claim serialization, duplicate-handover prevention and scheduler
interruption recovery. These are injected-component tests; they are not
distributed Postgres evidence.

## Completion matrix

| Area | Status | Evidence / limitation |
| --- | --- | --- |
| Durable queue schema | IN PROGRESS | Draft SQL only, no migration applied. |
| Atomic claim and fencing | IN PROGRESS | Parameterized SQL contract and prior isolated PostgreSQL CI. Cross-process adapter integration pending. |
| Durable checkpoints | IN PROGRESS | Queue checkpoint column and existing Neon etag design. Durable end-to-end test pending. |
| Idempotent receipts | IN PROGRESS | Receipt table draft. Effect sink integration pending. |
| Crash/interruption recovery | IN PROGRESS | Local failure matrix covers injected crashes and interruptions; process-crash and interrupted-transaction tests pending. |
| Supervisor and scheduler integration | IN PROGRESS | Bounded lifecycle and persistent checkpoint scheduler pass 17/17 locally; durable cross-worker state still pending. |
| Neon | VERIFIED (read-only inspection) | Project and disposable branches identified without writes. |
| Supabase | VERIFIED (no project available) | Discovery returned an empty project list. |
| Production safety | VERIFIED | No production query, migration, credential access, paid operation or deployment performed. |

The A01, A02, B1, B2, B4 and A20 gates remain open. This checkpoint does not
prove cloud execution or authorize production database changes.
