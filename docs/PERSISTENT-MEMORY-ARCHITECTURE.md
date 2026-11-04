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
4. Initially leave `WIN_MEMORY_BACKEND=blobs`; confirm the table and secret exist.
5. Set `WIN_MEMORY_BACKEND=mirror` on a deploy preview first. Verify normal library operations and inspect the Neon table for matching writes.
6. With the preview in `mirror` mode, invoke authenticated `POST /api/memory-backfill` with JSON body `{ "confirm": "BACKFILL_STRUCTURED_WIN_MEMORY" }`. This runs as a Netlify background function, copies only the allowlisted structured-memory collections, and verifies per-record canonical hashes plus exact key inventories. If it fails, inspect `GET /api/memory-status` and retry after resolving the cause; it does not delete either copy.
7. Confirm `backfill.status=completed` and `backfill.integrity=verified` through authenticated `GET /api/memory-status`. Test WIN reads/writes in preview while still in `mirror` mode.
8. Only after preview validation and explicit owner approval, set `WIN_MEMORY_BACKEND=neon`. Blobs remains the secondary replica. Production remains unchanged until the owner explicitly configures it.

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

- Neon is an independent provider copy; Netlify Blobs remains a second copy during mirror/cutover.
- Neon free-plan restore history and manual snapshots are useful operational safeguards, not a complete independent backup strategy.
- Before production cutover, implement and test an encrypted, versioned export of all rows to a third storage location with a manifest (row count, byte count, SHA-256, export time and schema version).
- Retain at least one copy outside both Neon and the Netlify site. Never commit backup payloads or credentials to Git.
- Perform periodic restore drills into a disposable database and compare row counts and checksums.
- Monitor Neon storage/compute quotas and Netlify Blobs storage/operations.

## Safety and operational boundaries

- No existing Blobs records are deleted by this integration.
- No database is provisioned automatically; the owner must create the Neon project and configure the secret.
- No production backend switch, bulk migration, production data mutation, or paid service activation is performed by this code change.
- No financial account/bankroll schema is introduced here. Financial limits must be added later as an append-only ledger with database-side atomic enforcement, not generic last-write-wins JSON records.
- Database connection strings are server-side secrets only.
