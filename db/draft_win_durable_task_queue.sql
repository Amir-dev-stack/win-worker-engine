-- Draft only. Apply only to a disposable Neon/Postgres branch after review.
-- No production migration, provider call, or financial operation is authorized.
BEGIN;
CREATE TABLE IF NOT EXISTS win_dev_task_queue (
  task_id text PRIMARY KEY CHECK (task_id ~ '^[A-Za-z0-9._-]{1,120}$'),
  repository text NOT NULL DEFAULT 'Amir-dev-stack/win-worker-engine'
    CHECK (repository = 'Amir-dev-stack/win-worker-engine'),
  source_commit_sha text NOT NULL CHECK (source_commit_sha ~ '^[0-9a-f]{40}$'),
  task_type text NOT NULL CHECK (task_type IN ('draft_only_development','read_only_review')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','waiting_limit','blocked_uncertain','completed','stopped')),
  approved boolean NOT NULL DEFAULT false,
  owner_id text CHECK (owner_id IS NULL OR owner_id ~ '^[A-Za-z0-9._:-]{1,120}$'),
  fence bigint NOT NULL DEFAULT 0 CHECK (fence >= 0 AND fence <= 9007199254740991),
  lease_expires_at timestamptz,
  checkpoint_commit_sha text CHECK (checkpoint_commit_sha IS NULL OR checkpoint_commit_sha ~ '^[0-9a-f]{40}$'),
  operation_id text NOT NULL CHECK (length(operation_id) > 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 8),
  last_error_code text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT win_dev_task_owner_state CHECK (
    (status = 'running' AND owner_id IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'running' AND owner_id IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT win_dev_task_operation_unique UNIQUE (operation_id)
);
CREATE TABLE IF NOT EXISTS win_dev_task_receipts (
  operation_id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES win_dev_task_queue(task_id),
  fence bigint NOT NULL,
  result_sha text CHECK (result_sha IS NULL OR result_sha ~ '^[0-9a-f]{40}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON win_dev_task_queue, win_dev_task_receipts FROM PUBLIC;
COMMIT;
