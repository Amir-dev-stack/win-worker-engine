-- Append-only audit ledger for owner-approved future odds collection.
-- This migration is staged only; do not apply to production without approval.
CREATE TABLE IF NOT EXISTS public.win_odds_collection_attempts (
  attempt_id text PRIMARY KEY,
  version text NOT NULL DEFAULT 'win.odds-collection-attempt.v1'
    CHECK (version = 'win.odds-collection-attempt.v1'),
  provider_id text NOT NULL CHECK (provider_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  licence_id text NOT NULL CHECK (licence_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  sport text NOT NULL CHECK (sport ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  markets text[] NOT NULL CHECK (cardinality(markets) > 0 AND array_position(markets, '') IS NULL AND array_position(markets, NULL) IS NULL),
  regions text[] NOT NULL CHECK (cardinality(regions) > 0 AND array_position(regions, '') IS NULL AND array_position(regions, NULL) IS NULL),
  planned_at timestamptz NOT NULL,
  requested_at timestamptz,
  ingested_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success','empty','rate_limited','provider_error','quota_exhausted','not_attempted')),
  total_used bigint CHECK (total_used IS NULL OR total_used >= 0),
  remaining bigint CHECK (remaining IS NULL OR remaining >= 0),
  last_request bigint CHECK (last_request IS NULL OR last_request >= 0),
  estimated_credits bigint NOT NULL CHECK (estimated_credits >= 0),
  reserve_credits bigint NOT NULL CHECK (reserve_credits >= 0),
  actual_credits bigint,
  estimate_variance bigint,
  reconciliation text NOT NULL CHECK (reconciliation IN ('matched','under_estimate','over_estimate','unknown')),
  correlation_id text NOT NULL CHECK (correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  response_sha256 text CHECK (response_sha256 IS NULL OR response_sha256 ~ '^[a-f0-9]{64}$'),
  returned_records integer NOT NULL CHECK (returned_records >= 0),
  oldest_source_observed_at timestamptz,
  newest_source_observed_at timestamptz,
  stop_further_collection boolean NOT NULL,
  stop_reason text,
  requires_owner_review boolean NOT NULL,
  secrets_persisted boolean NOT NULL DEFAULT false CHECK (secrets_persisted = false),
  immutable boolean NOT NULL DEFAULT true CHECK (immutable = true),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT win_odds_collection_attempt_time_order CHECK (
    ingested_at >= COALESCE(requested_at, planned_at)
    AND (requested_at IS NULL OR requested_at >= planned_at)
    AND (oldest_source_observed_at IS NULL OR oldest_source_observed_at <= ingested_at)
    AND (newest_source_observed_at IS NULL OR newest_source_observed_at <= ingested_at)
    AND (oldest_source_observed_at IS NULL OR newest_source_observed_at IS NULL
      OR oldest_source_observed_at <= newest_source_observed_at)
  ),
  CONSTRAINT win_odds_collection_attempt_outcome_shape CHECK (
    (outcome = 'not_attempted' AND requested_at IS NULL AND stop_further_collection)
    OR (outcome <> 'not_attempted' AND requested_at IS NOT NULL)
  ),
  CONSTRAINT win_odds_collection_attempt_record_count CHECK (
    (outcome = 'success' AND returned_records > 0)
    OR (outcome = 'empty' AND returned_records = 0)
    OR (outcome NOT IN ('success','empty'))
  ),
  CONSTRAINT win_odds_collection_attempt_usage_shape CHECK (
    (actual_credits IS NULL AND last_request IS NULL AND estimate_variance IS NULL AND reconciliation = 'unknown')
    OR (actual_credits IS NOT NULL AND actual_credits = last_request AND estimate_variance = actual_credits - estimated_credits
      AND reconciliation = CASE
        WHEN actual_credits = estimated_credits THEN 'matched'
        WHEN actual_credits < estimated_credits THEN 'under_estimate'
        ELSE 'over_estimate' END)
  ),
  CONSTRAINT win_odds_collection_attempt_stop_policy CHECK (
    (outcome IN ('rate_limited','provider_error','quota_exhausted','not_attempted') AND stop_further_collection)
    OR (remaining IS NOT NULL AND remaining <= reserve_credits AND stop_further_collection)
    OR (actual_credits IS NOT NULL AND actual_credits > estimated_credits AND stop_further_collection)
    OR (outcome NOT IN ('rate_limited','provider_error','quota_exhausted','not_attempted')
      AND (remaining IS NULL OR last_request IS NULL OR total_used IS NULL) AND stop_further_collection)
    OR (NOT stop_further_collection AND outcome IN ('success','empty')
      AND total_used IS NOT NULL AND remaining IS NOT NULL AND last_request IS NOT NULL AND actual_credits IS NOT NULL
      AND remaining > reserve_credits AND actual_credits <= estimated_credits)
  ),
  CONSTRAINT win_odds_collection_attempt_stop_reason CHECK (
    (stop_further_collection AND stop_reason IS NOT NULL)
    OR (NOT stop_further_collection AND stop_reason IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS win_odds_collection_attempts_provider_time_idx
  ON public.win_odds_collection_attempts (provider_id, ingested_at DESC);
CREATE INDEX IF NOT EXISTS win_odds_collection_attempts_outcome_time_idx
  ON public.win_odds_collection_attempts (outcome, ingested_at DESC);

CREATE OR REPLACE FUNCTION public.win_reject_odds_collection_attempt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'WIN odds collection attempts are append-only';
END;
$$;

DROP TRIGGER IF EXISTS win_odds_collection_attempts_append_only
  ON public.win_odds_collection_attempts;
CREATE TRIGGER win_odds_collection_attempts_append_only
  BEFORE UPDATE OR DELETE ON public.win_odds_collection_attempts
  FOR EACH ROW EXECUTE FUNCTION public.win_reject_odds_collection_attempt_mutation();
