# WIN Neon transactional store adapter

## Status

This is an additive, opt-in adapter. Netlify Blobs remains the default until the Neon path has passed isolated tests, test-branch integration tests, migration/reconciliation checks, and a controlled owner-approved cutover.

The expected table definition is staged in `database/migrations/20261107_win_memory_records.sql`. It is source-only: CI does not apply it, and it must be applied only to the dedicated test branch after explicit owner approval. It is not a production migration or cutover instruction.

## Activation contract

- Default: omit `WIN_TRANSACTIONAL_STORE`; existing Netlify Blobs behavior remains unchanged.
- Opt-in: set `WIN_TRANSACTIONAL_STORE=neon` and provide `WIN_NEON_DATABASE_URL`.
- If Neon is selected but its URL is missing or Neon fails, the store throws. It does not silently fall back to Blobs.
- The Neon adapter uses `public.win_memory_records` and the existing `record_key`, `kind`, `record_id`, `payload`, and `etag` columns.
- Create-only writes use one `INSERT ... ON CONFLICT DO NOTHING RETURNING` statement.
- Compare-and-swap writes use one `UPDATE ... WHERE record_key = ... AND etag = ... RETURNING` statement.
- Ordinary writes use one PostgreSQL upsert statement.
- Reads and prefix listing return the same basic shapes expected by WIN's store abstraction.
- The shared store factory is used by both research assignment claims and the OpenAI AI-budget controller. With Neon explicitly selected, the budget ledger, persistent owner lock, reservation records and assignment lease claims use the same PostgreSQL backend.

## Important limitations and next gates

1. This adapter is not activated in Netlify and no production environment variables were changed.
2. No data migration or seed from Netlify Blobs has been performed. The Neon tables inspected on 2026-11-07 were empty.
3. The adapter's SQL contract tests use a fake tagged SQL client. They do not prove live Neon connectivity, concurrent transaction behavior or provider-side behavior.
4. Run integration tests against the dedicated `win-memory-schema-test` branch before any production use.
5. Implement a paginated, idempotent Blobs-to-Neon migration with source/destination counts, key comparison, payload hashes, conflict reporting and a dry-run mode.
6. Before cutover, test simultaneous budget reservations, duplicate task claims, expired lease recovery, owner lock/unlock races, and failure/timeout behavior. The OpenAI budget controller has now been routed through the shared backend, but its real Neon concurrency behavior is not yet verified.
7. Preserve OpenAI Agents SDK execution, but keep it disabled until the transactional budget ledger and assignment claims are verified, provider-side spend limits are configured, and the owner explicitly approves activation.
8. Keep the existing $2.95 application operating stop unchanged. The owner has separately stated a $5/month maximum API ceiling; this adapter does not change either control.

## Rollback

Because the adapter is opt-in, rollback is to remove `WIN_TRANSACTIONAL_STORE=neon` and return to the current Blobs path, but only before Neon becomes authoritative and only after confirming no writes occurred exclusively in Neon. After any live cutover, rollback requires a reverse reconciliation first; never switch stores blindly.


## Live test-branch integration

A separately gated integration command is available:

```powershell
$env:WIN_NEON_TEST_DATABASE_URL = "<connection string for the dedicated win-memory-schema-test branch>"
$env:WIN_NEON_TEST_CONFIRM = "1"
$env:WIN_NEON_TEST_BRANCH_CONFIRM = "dedicated-test-branch"
$env:WIN_NEON_TEST_EXPECTED_DATABASE = "<exact test database name>"
$env:WIN_NEON_TEST_BUDGET_CONFIRM = "1"
npm run test:neon:integration
```

Use only the dedicated test branch connection string. Never use the production branch URL. The script rejects a URL matching `WIN_NEON_DATABASE_URL`, requires the explicit `dedicated-test-branch` confirmation, and verifies `current_database()` equals `WIN_NEON_TEST_EXPECTED_DATABASE` before it creates three uniquely named records, tests concurrent create-only and ETag compare-and-swap behavior, checks reads/metadata/prefix listing, and removes only those exact generated keys in a `finally` block. With the additional budget confirmation flag, it also runs the real AI-budget controller against Neon: concurrent reservations, conservative settlement of uncertain outcomes, denial above the $2.95 stop, and persistent owner-lock verification. Before that test, it refuses to run if the fixed budget ledger/lock/settings keys already exist on the test branch; it cleans only those exact keys afterward. It is intentionally excluded from the default test suite and GitHub CI because no database secret is stored in the repository.

The test has not been run yet. A successful result is required before enabling the Neon adapter in any deployed environment.


## Read-only Blobs-to-Neon migration audit

The repository includes `scripts/win-store-migration-audit.mjs` and the command `npm run audit:store-migration`. This is a read-only comparison tool, not a migration or cutover tool.

It reads the current site-wide Netlify Blobs store `win-engine` in `eu-central-1` with strong consistency, reads rows from `public.win_memory_records` on the Neon connection supplied as the test target, and compares canonical JSON SHA-256 hashes. It reports counts and a small sample of mismatched keys; it never prints payload contents and performs zero writes.

PowerShell example (use the dedicated `win-memory-schema-test` branch connection string):

```powershell
$env:NETLIFY_SITE_ID = "<Netlify site ID>"
$env:NETLIFY_AUTH_TOKEN = "<Netlify read-capable token>"
$env:WIN_NEON_TEST_DATABASE_URL = "<Neon test-branch connection string>"
$env:WIN_NEON_TEST_BRANCH_CONFIRM = "dedicated-test-branch"
$env:WIN_NEON_TEST_EXPECTED_DATABASE = "<exact test database name>"
$env:WIN_MIGRATION_AUDIT_CONFIRM = "1"
npm run audit:store-migration
```

Optional record cap:

```powershell
$env:WIN_MIGRATION_AUDIT_MAX_RECORDS = "100000"
```

The default cap is 100,000 and the hard cap is 1,000,000. The cap applies independently to both source and destination scans. A cap overflow aborts rather than silently producing a partial comparison. A non-zero exit status indicates missing payloads, missing keys, or hash mismatches. A clean audit is necessary but not sufficient for cutover: repeat it after a quiesced/captured write window, reconcile concurrent writes, verify all non-JSON artifact stores separately, and complete concurrency, backup/restore and rollback drills. This tool deliberately has no copy, delete, truncate, schema-change or environment-setting operation.

Do not point this at production Neon. The audit also rejects a test URL matching `WIN_NEON_DATABASE_URL` and verifies the expected database name before scanning. Do not set `WIN_TRANSACTIONAL_STORE=neon` while running it. Netlify credentials must remain local environment variables and must never be committed or pasted into GitHub issues.
