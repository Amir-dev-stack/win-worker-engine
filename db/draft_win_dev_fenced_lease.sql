-- WIN development backup: proposed Neon/PostgreSQL fenced lease schema.
-- DRAFT ONLY. DO NOT APPLY without database owner review, backup, and security review.
-- This does not deploy an agent, authenticate model calls, or prove PC-off execution.
-- A trusted service (not user/LLM-supplied JSON) must populate approved tasks,
-- authenticate owner_id and verify source_commit_sha from a known GitHub ref.
-- Never store prompts, model output, credentials, or private file contents here.
BEGIN;
CREATE TABLE IF NOT EXISTS win_dev_lease_tasks (
  task_id text PRIMARY KEY CHECK (task_id ~ '^[A-Za-z0-9._-]{1,120}$'),
  repository text NOT NULL DEFAULT 'Amir-dev-stack/win-worker-engine'
    CHECK (repository = 'Amir-dev-stack/win-worker-engine'),
  source_commit_sha text NOT NULL
    CHECK (source_commit_sha ~ '^[0-9a-f]{40}$'),
  task_type text NOT NULL CHECK (task_type IN ('read_only_review', 'draft_only_development')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','blocked_uncertain','completed','stopped')),
  approved boolean NOT NULL DEFAULT false,
  production_write_allowed boolean NOT NULL DEFAULT false
    CHECK (production_write_allowed = false),
  paid_spend_allowed boolean NOT NULL DEFAULT false
    CHECK (paid_spend_allowed = false),
  owner_id text,
  fence bigint NOT NULL DEFAULT 0 CHECK (fence >= 0 AND fence <= 9007199254740991),
  expires_at timestamptz,
  checkpoint_commit_sha text CHECK (
    checkpoint_commit_sha IS NULL OR checkpoint_commit_sha ~ '^[0-9a-f]{40}$'
  ),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT win_lease_owner_consistency CHECK (
    (status = 'running' AND owner_id IS NOT NULL AND expires_at IS NOT NULL)
    OR (status <> 'running' AND owner_id IS NULL AND expires_at IS NULL)
  ),
  CONSTRAINT win_lease_owner_format CHECK (
    owner_id IS NULL OR owner_id ~ '^[A-Za-z0-9._:-]{1,120}$'
  )
);
-- DB roles and GRANTs must be configured separately. Never give credentials
-- to an untrusted agent, the public web, or an LLM prompt.
REVOKE ALL ON win_dev_lease_tasks FROM PUBLIC;
COMMIT;
