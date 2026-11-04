# WIN persistent memory: Neon + Netlify Blobs

## Goal

Add an independent PostgreSQL copy of WIN's existing key/value memory without deleting, rewriting, or prematurely migrating any Netlify Blobs data.

## Architecture

- **Netlify Blobs** remains the current production source of truth by default.
- **Neon PostgreSQL** stores the same `kind/id` records in `win_memory_records`.
- `WIN_MEMORY_BACKEND=blobs` (default): existing behaviour; no Neon connection is attempted.
- `WIN_MEMORY_BACKEND=mirror`: Blobs is primary and writes to an explicit allowlist of structured memory collections are also copied to Neon. Large raw data collections are intentionally excluded. Reads remain Blobs-first and can fall back to Neon for individual missing keys; list reads include the primary collection and consult the replica when the primary has fewer than the requested limit.
- `WIN_MEMORY_BACKEND=neon`: Neon is primary only for the allowlisted structured memory collections; Blobs remains the primary store for raw data and the replica for structured memory. Do not enable until a complete backfill and reconciliation has been performed.

Both stores are written on allowlisted structured-memory mutations. This is a recoverable dual-write, not a distributed transaction: a failure after the primary write can leave the replica behind. The request fails visibly; retrying the same stable key is idempotent. Monitor and reconcile before a backend cutover.

## Neon setup

1. Create a Neon project in an EU region at https://console.neon.tech/.
2. In the Neon SQL Editor, apply `database/neon/0001_win_memory_records.sql`.
3. In Netlify site settings, create secret runtime variable `WIN_NEON_DATABASE_URL` using the Neon pooled connection string. Do not put it in Git, dashboard JavaScript, or chat.
4. Generate a separate random 32-byte key and configure it as secret runtime variable `WIN_MEMORY_BACKUP_KEY` (64 hexadecimal characters). Keep a secure offline copy of this key; encrypted backups cannot be restored without it.
5. Initially leave `WIN_MEMORY_BACKEND=blobs`; confirm the table and both secrets exist.
6. Set `WIN_MEMORY_BACKEND=mirror` on a deploy preview first. Verify normal library operations and inspect the Neon table for matching writes.
7. With the preview in `mirror` mode, invoke authenticated `POST /api/memory-backfill` with JSON body `{ "confirm": "BACKFILL_STRUCTURED_WIN_MEMORY" }`. This runs as a Netlify background function, copies only the allowlisted structured-memory collections, and verifies per-record canonical hashes plus exact key inventories. If it fails, inspect `GET /api/memory-status` and retry after resolving the cause; it does not delete either copy.
8. Confirm `backfill.status=completed` and `backfill.integrity=verified` through authenticated `GET /api/memory-status`. Test WIN reads/writes in preview while still in `mirror` mode.
9. After Neon is active, the scheduled function creates an AES-256-GCM encrypted, gzip-compressed JSONL snapshot in Netlify Blobs daily at 03:23 UTC, retaining 30 days. It requires `WIN_MEMORY_BACKUP_KEY`; the same key must be preserved securely outside Netlify.
10. A snapshot can be replayed into Neon only while Blobs remains primary using authenticated `POST /api/memory-restore` with `{ "confirm": "RESTORE_NEON_MEMORY_SNAPSHOT", "date": "YYYY-MM-DD" }`. Restore verifies the encrypted SHA-256, GCM authentication tag, decompressed SHA-256 and row count. It upserts snapshot records into Neon and never overwrites the Blobs primary.
11. Only after preview validation and explicit owner approval, set `WIN_MEMORY_BACKEND=neon`. Blobs remains the secondary replica. Production remains unchanged until the owner explicitly configures it.

Do not set the backend to `neon` just because the connection test works. A connected but incompletely backfilled database would make old records appear missing in collection queries.

## Data model

The current store API uses a generic record table to preserve every existing WIN collection without destructive schema translation:

- `record_key`: stable `kind/id` primary key
- `kind`, `record_id`: indexed collection identity
- `payload`: full JSONB record with all source fields and provenance
- `etag`: opaque per-write token for conditional updates
- `created_at`, `updated_at`: database timestamps

This includes agent profiles, observations, research runs, frozen predictions, player/team entity dossiers, coupons, settlements, learning candidates and review records. Raw match timelines, play-by-play rows and provider payload archives are excluded. It does not mark unverified user submissions or candidate lessons as trusted.

## Backups and recovery

- Neon is the structured-memory database; Netlify Blobs is the independent provider replica and versioned backup destination.
- The scheduled backup writes AES-256-GCM encrypted, gzip-compressed JSONL snapshots to `library/memory-backups/`, with a manifest containing row/byte counts, SHA-256 hashes, collection counts, schema version and export time. Retention is 30 days.
- `WIN_MEMORY_BACKUP_KEY` is a separate 32-byte hex secret. Keep an offline copy in a password manager or other secure secret store. Losing this key makes existing encrypted snapshots unrecoverable.
- The restore endpoint only replays snapshots into Neon while Blobs is primary; it does not delete records or overwrite the Blobs copy. Restore is an explicit owner action, not automatic rollback.
- This provides two-provider redundancy (Neon + Netlify). It is not a third-provider/offline backup. For protection against loss of both provider accounts, periodically copy encrypted snapshots and the key to a separate secure location.
- Monitor Neon storage/compute quotas and Netlify Blobs storage/operations; backup runs fail rather than publish partial snapshots if safety limits are exceeded.

## Safety and operational boundaries

- No existing Blobs records are deleted by this integration.
- No database is provisioned automatically; the owner must create the Neon project and configure the secret.
- No production backend switch, bulk migration, production data mutation, or paid service activation is performed by this code change.
- No financial account/bankroll schema is introduced here. Financial limits must be added later as an append-only ledger with database-side atomic enforcement, not generic last-write-wins JSON records.
- Database connection strings are server-side secrets only.
