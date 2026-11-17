-- WIN portable worker schema v1
-- REVIEW ONLY. Executed only on the isolated Neon validation branch.
-- No money, secrets, betting or production data lives in these objects.
-- The same migration should be executed from CI/CLI against any authorized
-- Postgres backend, not embedded inside a Netlify function.
CREATE TABLE IF NOT EXISTS public.win_research_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  job_type text NOT NULL CHECK (job_type IN (
    'fixture_refresh','player_stats_refresh','pre_match_research','paper_coupon',
    'settlement_review','calibration','coverage_audit'
  )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','retry','dead_letter')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_win_research_jobs_eligible
  ON public.win_research_jobs (run_after, created_at)
  WHERE status IN ('pending','retry');
CREATE INDEX IF NOT EXISTS idx_win_research_jobs_lease
  ON public.win_research_jobs (lease_expires_at)
  WHERE status='running';

CREATE TABLE IF NOT EXISTS public.win_source_observations (
  observation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL,
  resource text NOT NULL,
  event_ref text NOT NULL,
  source_url text,
  source_retrieved_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  raw_checksum text NOT NULL,
  coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  licence_reviewed boolean NOT NULL DEFAULT false,
  UNIQUE (provider,resource,event_ref,source_retrieved_at,raw_checksum)
);
CREATE INDEX IF NOT EXISTS idx_win_source_observations_event
  ON public.win_source_observations (provider,event_ref,source_retrieved_at DESC);

CREATE TABLE IF NOT EXISTS public.win_worker_heartbeats (
  worker_id text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL,
  last_job_id uuid,
  status text NOT NULL CHECK (status IN ('starting','idle','working','degraded','stopped')),
  diagnostic_code text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- SECURITY REVIEW BEFORE PRODUCTION:
-- DB role used by the cloud worker must be restricted to the necessary tables.
-- Never grant broad public access, insert API keys, or store betting credentials.
-- Production rollout requires safe backups, rollback procedure and exact quota checks.
