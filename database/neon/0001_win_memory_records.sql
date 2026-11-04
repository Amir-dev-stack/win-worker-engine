-- WIN persistent memory store (Neon PostgreSQL).
-- Apply once in the Neon SQL Editor before setting WIN_MEMORY_BACKEND=mirror.
-- This table is private to the server-side database role; WIN never exposes SQL credentials.

CREATE TABLE IF NOT EXISTS win_memory_records (
  record_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  etag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT win_memory_record_key_nonempty CHECK (length(record_key) > 2),
  CONSTRAINT win_memory_kind_nonempty CHECK (length(kind) > 0),
  CONSTRAINT win_memory_id_nonempty CHECK (length(record_id) > 0)
);

CREATE INDEX IF NOT EXISTS win_memory_records_kind_updated_idx
  ON win_memory_records (kind, updated_at DESC, record_key ASC);

CREATE INDEX IF NOT EXISTS win_memory_records_updated_idx
  ON win_memory_records (updated_at DESC);

COMMENT ON TABLE win_memory_records IS
  'WIN durable key/value memory replica. Netlify Blobs remains the source of truth until a verified backfill and explicit backend cutover.';
COMMENT ON COLUMN win_memory_records.record_key IS
  'Stable WIN storage key in kind/id format.';
COMMENT ON COLUMN win_memory_records.payload IS
  'Complete JSON record; preserve source provenance and validation status.';
COMMENT ON COLUMN win_memory_records.etag IS
  'Opaque per-write version token used for conditional single-record updates.';
