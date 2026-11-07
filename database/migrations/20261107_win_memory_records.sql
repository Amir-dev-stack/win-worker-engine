-- Staged schema contract for the opt-in WIN Neon store adapter.
-- This file is not executed by CI or deployment. Apply only to the dedicated
-- test branch after explicit owner approval; never use it as a production cutover.
CREATE TABLE IF NOT EXISTS public.win_memory_records (
  record_key text PRIMARY KEY,
  kind text NOT NULL CHECK (kind <> ''),
  record_id text NOT NULL CHECK (record_id <> ''),
  payload jsonb NOT NULL,
  etag text NOT NULL CHECK (etag <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT win_memory_records_key_parts_match
    CHECK (record_key = kind || '/' || record_id)
);

CREATE INDEX IF NOT EXISTS win_memory_records_kind_record_idx
  ON public.win_memory_records (kind, record_id);
