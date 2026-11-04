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


-- Transactional financial memory. No account is created or seeded by this migration.
-- Cash balance is opening_balance + realized P/L + deposits/withdrawals/adjustments.
-- Open exposure is tracked separately; WIN does not place bets through this schema.
CREATE TABLE IF NOT EXISTS win_financial_accounts (
  account_id TEXT PRIMARY KEY,
  currency CHAR(3) NOT NULL,
  opening_balance NUMERIC(18,2) NOT NULL CHECK (opening_balance >= 0),
  max_total_exposure NUMERIC(18,2) NOT NULL CHECK (max_total_exposure > 0),
  max_single_exposure NUMERIC(18,2) NOT NULL CHECK (max_single_exposure > 0),
  daily_loss_limit NUMERIC(18,2) NOT NULL CHECK (daily_loss_limit > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (max_single_exposure <= max_total_exposure)
);

CREATE TABLE IF NOT EXISTS win_financial_ledger (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES win_financial_accounts(account_id),
  idempotency_key TEXT NOT NULL UNIQUE,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'deposit', 'withdrawal', 'exposure_open', 'exposure_close', 'realized_pnl', 'adjustment'
  )),
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  exposure_delta NUMERIC(18,2) NOT NULL DEFAULT 0,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(idempotency_key) > 0)
);

CREATE INDEX IF NOT EXISTS win_financial_ledger_account_created_idx
  ON win_financial_ledger (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS win_financial_ledger_account_type_created_idx
  ON win_financial_ledger (account_id, entry_type, created_at DESC);

CREATE OR REPLACE FUNCTION win_record_financial_entry(
  p_account_id TEXT,
  p_idempotency_key TEXT,
  p_entry_type TEXT,
  p_amount NUMERIC,
  p_exposure_delta NUMERIC,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  accepted BOOLEAN,
  entry_id UUID,
  reason TEXT,
  current_exposure NUMERIC,
  daily_loss NUMERIC,
  current_balance NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_account win_financial_accounts%ROWTYPE;
  v_existing win_financial_ledger%ROWTYPE;
  v_exposure NUMERIC(18,2);
  v_daily_loss NUMERIC(18,2);
  v_balance NUMERIC(18,2);
  v_entry_id UUID;
BEGIN
  SELECT * INTO v_account
    FROM win_financial_accounts
    WHERE account_id = p_account_id
    FOR UPDATE;

  IF NOT FOUND OR NOT v_account.is_active THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'account_missing_or_inactive', 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  SELECT * INTO v_existing
    FROM win_financial_ledger
    WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.account_id <> p_account_id THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'idempotency_key_account_mismatch', 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
    SELECT COALESCE(SUM(exposure_delta), 0) INTO v_exposure
      FROM win_financial_ledger WHERE account_id = p_account_id;
    SELECT GREATEST(0, -COALESCE(SUM(amount), 0)) INTO v_daily_loss
      FROM win_financial_ledger
      WHERE account_id = p_account_id AND entry_type = 'realized_pnl'
        AND created_at >= date_trunc('day', NOW());
    SELECT v_account.opening_balance + COALESCE(SUM(amount), 0) INTO v_balance
      FROM win_financial_ledger WHERE account_id = p_account_id;
    RETURN QUERY SELECT TRUE, v_existing.entry_id, 'duplicate_ignored', v_exposure, v_daily_loss, v_balance;
    RETURN;
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'idempotency_key_required', 0::NUMERIC, 0::NUMERIC, v_account.opening_balance;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(exposure_delta), 0) INTO v_exposure
    FROM win_financial_ledger WHERE account_id = p_account_id;
  SELECT GREATEST(0, -COALESCE(SUM(amount), 0)) INTO v_daily_loss
    FROM win_financial_ledger
    WHERE account_id = p_account_id AND entry_type = 'realized_pnl'
      AND created_at >= date_trunc('day', NOW());
  SELECT v_account.opening_balance + COALESCE(SUM(amount), 0) INTO v_balance
    FROM win_financial_ledger WHERE account_id = p_account_id;

  IF p_entry_type = 'exposure_open' THEN
    IF p_exposure_delta <= 0 OR p_amount <> 0 THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'invalid_exposure_open', v_exposure, v_daily_loss, v_balance;
      RETURN;
    END IF;
    IF p_exposure_delta > v_account.max_single_exposure THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'single_exposure_limit_exceeded', v_exposure, v_daily_loss, v_balance;
      RETURN;
    END IF;
    IF v_exposure + p_exposure_delta > v_account.max_total_exposure THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'total_exposure_limit_exceeded', v_exposure, v_daily_loss, v_balance;
      RETURN;
    END IF;
    IF v_daily_loss >= v_account.daily_loss_limit THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'daily_loss_limit_reached', v_exposure, v_daily_loss, v_balance;
      RETURN;
    END IF;
  ELSIF p_entry_type = 'exposure_close' THEN
    IF p_exposure_delta >= 0 OR p_amount <> 0 OR v_exposure + p_exposure_delta < 0 THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'invalid_exposure_close', v_exposure, v_daily_loss, v_balance;
      RETURN;
    END IF;
  ELSIF p_entry_type = 'realized_pnl' THEN
    IF p_exposure_delta <> 0 THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'realized_pnl_cannot_change_exposure', v_exposure, v_daily_loss, v_balance;
      RETURN;
    END IF;
  ELSIF p_entry_type = 'deposit' THEN
    IF p_amount <= 0 OR p_exposure_delta <> 0 THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'invalid_deposit', v_exposure, v_daily_loss, v_balance;
      RETURN;
    END IF;
  ELSIF p_entry_type = 'withdrawal' THEN
    IF p_amount >= 0 OR p_exposure_delta <> 0 OR v_balance + p_amount < 0 THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'invalid_withdrawal', v_exposure, v_daily_loss, v_balance;
      RETURN;
    END IF;
  ELSIF p_entry_type = 'adjustment' THEN
    IF p_exposure_delta <> 0 THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'adjustment_cannot_change_exposure', v_exposure, v_daily_loss, v_balance;
      RETURN;
    END IF;
  ELSE
    RETURN QUERY SELECT FALSE, NULL::UUID, 'unsupported_entry_type', v_exposure, v_daily_loss, v_balance;
    RETURN;
  END IF;

  INSERT INTO win_financial_ledger (
    account_id, idempotency_key, entry_type, amount, exposure_delta, reference_id, metadata
  ) VALUES (
    p_account_id, p_idempotency_key, p_entry_type, p_amount, p_exposure_delta,
    p_reference_id, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING win_financial_ledger.entry_id INTO v_entry_id;

  v_exposure := v_exposure + p_exposure_delta;
  v_balance := v_balance + p_amount;
  IF p_entry_type = 'realized_pnl' THEN
    v_daily_loss := GREATEST(0, v_daily_loss - p_amount);
  END IF;

  RETURN QUERY SELECT TRUE, v_entry_id, 'recorded', v_exposure, v_daily_loss, v_balance;
END;
$$;

REVOKE ALL ON win_financial_accounts FROM PUBLIC;
REVOKE ALL ON win_financial_ledger FROM PUBLIC;
REVOKE ALL ON FUNCTION win_record_financial_entry(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) FROM PUBLIC;
