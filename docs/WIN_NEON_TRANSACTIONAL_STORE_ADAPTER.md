# WIN Neon transactional store adapter

## Status

This is an additive, opt-in adapter. Netlify Blobs remains the default until the Neon path has passed isolated tests, test-branch integration tests, migration/reconciliation checks, and a controlled owner-approved cutover.

## Activation contract

- Default: omit `WIN_TRANSACTIONAL_STORE`; existing Netlify Blobs behavior remains unchanged.
- Opt-in: set `WIN_TRANSACTIONAL_STORE=neon` and provide `WIN_NEON_DATABASE_URL`.
- If Neon is selected but its URL is missing or Neon fails, the store throws. It does not silently fall back to Blobs.
- The Neon adapter uses `public.win_memory_records` and the existing `record_key`, `kind`, `record_id`, `payload`, and `etag` columns.
- Create-only writes use one `INSERT ... ON CONFLICT DO NOTHING RETURNING` statement.
- Compare-and-swap writes use one `UPDATE ... WHERE record_key = ... AND etag = ... RETURNING` statement.
- Ordinary writes use one PostgreSQL upsert statement.
- Reads and prefix listing return the same basic shapes expected by WIN's store abstraction.

## Important limitations and next gates

1. This adapter is not activated in Netlify and no production environment variables were changed.
2. No data migration or seed from Netlify Blobs has been performed. The Neon tables inspected on 2026-11-07 were empty.
3. The adapter's SQL contract tests use a fake tagged SQL client. They do not prove live Neon connectivity, concurrent transaction behavior or provider-side behavior.
4. Run integration tests against the dedicated `win-memory-schema-test` branch before any production use.
5. Implement a paginated, idempotent Blobs-to-Neon migration with source/destination counts, key comparison, payload hashes, conflict reporting and a dry-run mode.
6. Before cutover, test simultaneous budget reservations, duplicate task claims, expired lease recovery, owner lock/unlock races, and failure/timeout behavior.
7. Preserve OpenAI Agents SDK execution, but keep it disabled until the transactional budget ledger and assignment claims are verified, provider-side spend limits are configured, and the owner explicitly approves activation.
8. Keep the existing $2.95 application operating stop unchanged. The owner has separately stated a $5/month maximum API ceiling; this adapter does not change either control.

## Rollback

Because the adapter is opt-in, rollback is to remove `WIN_TRANSACTIONAL_STORE=neon` and return to the current Blobs path, but only before Neon becomes authoritative and only after confirming no writes occurred exclusively in Neon. After any live cutover, rollback requires a reverse reconciliation first; never switch stores blindly.
