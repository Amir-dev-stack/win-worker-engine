import { getRuntimeEnv } from "./runtime-env.mts";

import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

type NeonRow = { record_key: string; payload: unknown; etag: string };
type StoreOptions = { onlyIfNew?: boolean; onlyIfMatch?: string };

function connectionString(): string {
  const value = process.env.WIN_NEON_DATABASE_URL?.trim();
  if (!value) throw new Error("WIN_NEON_DATABASE_URL is required when WIN_MEMORY_BACKEND is mirror or neon.");
  if (!/^postgres(?:ql)?:\/\//i.test(value)) throw new Error("WIN_NEON_DATABASE_URL must be a PostgreSQL connection string.");
  return value;
}

function splitKey(key: string): { kind: string; id: string } {
  const separator = key.indexOf("/");
  if (separator < 1 || separator === key.length - 1) throw new Error("WIN memory keys must use kind/id format.");
  return { kind: key.slice(0, separator), id: key.slice(separator + 1) };
}

let cachedUrl = "";
let cachedStore: ReturnType<typeof neon> | null = null;
function sql() {
  const url = connectionString();
  if (!cachedStore || cachedUrl !== url) {
    cachedUrl = url;
    cachedStore = neon(url, { fetchOptions: { cache: "no-store" } });
  }
  return cachedStore;
}

function rowsOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

/**
 * PostgreSQL implementation of the WIN key/value store contract.
 * The committed SQL migration must be applied before enabling this backend.
 */
export function getNeonStore() {
  return {
    async setJSON(key: string, value: unknown, options: StoreOptions = {}) {
      const { kind, id } = splitKey(key);
      const payload = JSON.stringify(value);
      if (payload === undefined) throw new Error("WIN memory records must be JSON-serializable values.");
      const etag = randomUUID();
      if (options.onlyIfNew) {
        const rows = rowsOf<NeonRow>(await sql()`INSERT INTO win_memory_records
          (record_key, kind, record_id, payload, etag)
          VALUES (${key}, ${kind}, ${id}, ${payload}::jsonb, ${etag})
          ON CONFLICT (record_key) DO NOTHING
          RETURNING record_key, etag`);
        return { modified: rows.length > 0, etag: rows[0]?.etag ?? null };
      }
      if (options.onlyIfMatch) {
        const rows = rowsOf<NeonRow>(await sql()`UPDATE win_memory_records
          SET payload = ${payload}::jsonb, etag = ${etag}, updated_at = now()
          WHERE record_key = ${key} AND etag = ${options.onlyIfMatch}
          RETURNING record_key, etag`);
        return { modified: rows.length > 0, etag: rows[0]?.etag ?? null };
      }
      const rows = rowsOf<NeonRow>(await sql()`INSERT INTO win_memory_records
        (record_key, kind, record_id, payload, etag)
        VALUES (${key}, ${kind}, ${id}, ${payload}::jsonb, ${etag})
        ON CONFLICT (record_key) DO UPDATE
        SET kind = EXCLUDED.kind, record_id = EXCLUDED.record_id,
            payload = EXCLUDED.payload, etag = EXCLUDED.etag, updated_at = now()
        RETURNING record_key, etag`);
      return { modified: rows.length > 0, etag };
    },

    async get(key: string) {
      const rows = rowsOf<NeonRow>(await sql()`SELECT payload FROM win_memory_records WHERE record_key = ${key} LIMIT 1`);
      return rows[0]?.payload ?? null;
    },

    async getWithMetadata(key: string) {
      const rows = rowsOf<NeonRow>(await sql()`SELECT payload, etag FROM win_memory_records WHERE record_key = ${key} LIMIT 1`);
      if (!rows[0]) return null;
      return { data: rows[0].payload, etag: rows[0].etag };
    },

    async *list(options: { prefix?: string; paginate?: boolean } = {}) {
      const prefix = String(options.prefix || "");
      const separator = prefix.indexOf("/");
      if (separator < 1 || !prefix.endsWith("/")) return;
      const kind = prefix.slice(0, -1);
      const pageSize = 250;
      let cursor: { updatedAt: string; key: string } | null = null;
      while (true) {
        const page = cursor
          ? rowsOf<{ record_key: string; updated_at: string }>(await sql()`SELECT record_key, updated_at::text AS updated_at
              FROM win_memory_records
              WHERE kind = ${kind}
                AND (updated_at < ${cursor.updatedAt}::timestamptz
                  OR (updated_at = ${cursor.updatedAt}::timestamptz AND record_key > ${cursor.key}))
              ORDER BY updated_at DESC, record_key ASC LIMIT ${pageSize}`)
          : rowsOf<{ record_key: string; updated_at: string }>(await sql()`SELECT record_key, updated_at::text AS updated_at
              FROM win_memory_records WHERE kind = ${kind}
              ORDER BY updated_at DESC, record_key ASC LIMIT ${pageSize}`);
        if (!page.length) break;
        yield { blobs: page.map(row => ({ key: row.record_key })) };
        if (!options.paginate || page.length < pageSize) break;
        const last = page[page.length - 1];
        cursor = { updatedAt: last.updated_at, key: last.record_key };
      }
    },

    async delete(key: string) {
      await sql()`DELETE FROM win_memory_records WHERE record_key = ${key}`;
      return { deleted: true };
    },

    async health() {
      const rows = rowsOf<{ record_count: string; database_time: string }>(await sql()`
        SELECT COUNT(*)::text AS record_count, now()::text AS database_time
        FROM win_memory_records`);
      return { ok: true, recordCount: Number(rows[0]?.record_count || 0), databaseTime: rows[0]?.database_time || null };
    },

    async createFinancialAccount(input: {
      accountId: string; currency: string; openingBalance: number;
      maxTotalExposure: number; maxSingleExposure: number; dailyLossLimit: number;
    }) {
      const rows = rowsOf<any>(await sql()`INSERT INTO win_financial_accounts
        (account_id, currency, opening_balance, max_total_exposure, max_single_exposure, daily_loss_limit)
        VALUES (${input.accountId}, ${input.currency}, ${input.openingBalance},
          ${input.maxTotalExposure}, ${input.maxSingleExposure}, ${input.dailyLossLimit})
        RETURNING account_id, currency, opening_balance, max_total_exposure,
          max_single_exposure, daily_loss_limit, is_active, created_at`);
      return rows[0] ?? null;
    },

    async getFinancialAccount(accountId: string) {
      const accounts = rowsOf<any>(await sql()`SELECT account_id, currency, opening_balance,
        max_total_exposure, max_single_exposure, daily_loss_limit, is_active, created_at, updated_at
        FROM win_financial_accounts WHERE account_id = ${accountId} LIMIT 1`);
      if (!accounts[0]) return null;
      const stats = rowsOf<any>(await sql()`SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM win_financial_ledger WHERE account_id = ${accountId})::text AS ledger_delta,
        (SELECT COALESCE(SUM(exposure_delta), 0) FROM win_financial_ledger WHERE account_id = ${accountId})::text AS current_exposure,
        (SELECT GREATEST(0, -COALESCE(SUM(amount), 0)) FROM win_financial_ledger
          WHERE account_id = ${accountId} AND entry_type = 'realized_pnl'
          AND created_at >= date_trunc('day', NOW()))::text AS daily_loss`);
      return {
        ...accounts[0],
        current_balance: Number(accounts[0].opening_balance) + Number(stats[0]?.ledger_delta || 0),
        current_exposure: Number(stats[0]?.current_exposure || 0),
        daily_loss: Number(stats[0]?.daily_loss || 0)
      };
    },

    async recordFinancialEntry(input: {
      accountId: string; idempotencyKey: string; entryType: string;
      amount: number; exposureDelta: number; referenceId?: string | null; metadata?: Record<string, unknown>;
    }) {
      const rows = rowsOf<any>(await sql()`SELECT * FROM win_record_financial_entry(
        ${input.accountId}, ${input.idempotencyKey}, ${input.entryType},
        ${input.amount}, ${input.exposureDelta}, ${input.referenceId || null},
        ${JSON.stringify(input.metadata || {})}::jsonb)`);
      return rows[0] ?? null;
    },

    async exportFinancialData() {
      const accounts = rowsOf<any>(await sql()`SELECT account_id, currency, opening_balance,
        max_total_exposure, max_single_exposure, daily_loss_limit, is_active, created_at, updated_at
        FROM win_financial_accounts ORDER BY account_id`);
      const ledger = rowsOf<any>(await sql()`SELECT entry_id, account_id, idempotency_key, entry_type,
        amount, exposure_delta, reference_id, metadata, created_at
        FROM win_financial_ledger ORDER BY account_id, created_at, entry_id`);
      return { accounts, ledger };
    },

    async restoreFinancialRecord(kind: "account" | "ledger", value: any) {
      if (kind === "account") {
        await sql()`INSERT INTO win_financial_accounts
          (account_id, currency, opening_balance, max_total_exposure, max_single_exposure,
           daily_loss_limit, is_active, created_at, updated_at)
          VALUES (${value.account_id}, ${value.currency}, ${value.opening_balance},
            ${value.max_total_exposure}, ${value.max_single_exposure}, ${value.daily_loss_limit},
            ${value.is_active}, ${value.created_at}, ${value.updated_at})
          ON CONFLICT (account_id) DO NOTHING`;
        return;
      }
      await sql()`INSERT INTO win_financial_ledger
        (entry_id, account_id, idempotency_key, entry_type, amount, exposure_delta,
         reference_id, metadata, created_at)
        VALUES (${value.entry_id}, ${value.account_id}, ${value.idempotency_key}, ${value.entry_type},
          ${value.amount}, ${value.exposure_delta}, ${value.reference_id},
          ${JSON.stringify(value.metadata || {})}::jsonb, ${value.created_at})
        ON CONFLICT DO NOTHING`;
    }
  };
}
