import { randomUUID } from "node:crypto";

type NeonSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>;

type NeonStoreOptions = {
  pageSize?: number;
};

/**
 * Neon-backed implementation of the WIN key/value store contract.
 *
 * Every conditional mutation is one PostgreSQL statement, so create-only and
 * ETag compare-and-swap operations are enforced by the database rather than
 * by application-side read/modify/write logic.
 */
export function createNeonStore(sql: NeonSql, options: NeonStoreOptions = {}) {
  if (typeof sql !== "function") throw new Error("A Neon SQL client is required.");
  const pageSize = Math.max(50, Math.min(1000, Math.floor(options.pageSize ?? 500)));

  function splitKey(key: string) {
    const slash = key.indexOf("/");
    if (slash < 1 || slash === key.length - 1) {
      throw new Error("WIN store keys must use a non-empty kind/id format.");
    }
    return { kind: key.slice(0, slash), recordId: key.slice(slash + 1) };
  }

  async function setJSON(key: string, value: unknown, conditions: any = {}) {
    const { kind, recordId } = splitKey(key);
    const etag = randomUUID();
    const payload = JSON.stringify(value);
    if (payload === undefined) throw new Error("WIN store values must be JSON serializable.");

    if (conditions.onlyIfNew === true) {
      const rows = await sql`INSERT INTO public.win_memory_records
        (record_key, kind, record_id, payload, etag, created_at, updated_at)
        VALUES (${key}, ${kind}, ${recordId}, ${payload}::jsonb, ${etag}, now(), now())
        ON CONFLICT (record_key) DO NOTHING
        RETURNING etag`;
      return { modified: rows.length === 1, etag: rows[0]?.etag ?? null };
    }

    if (typeof conditions.onlyIfMatch === "string") {
      const rows = await sql`UPDATE public.win_memory_records
        SET payload = ${payload}::jsonb, etag = ${etag}, updated_at = now()
        WHERE record_key = ${key} AND etag = ${conditions.onlyIfMatch}
        RETURNING etag`;
      return { modified: rows.length === 1, etag: rows[0]?.etag ?? null };
    }

    const rows = await sql`INSERT INTO public.win_memory_records
      (record_key, kind, record_id, payload, etag, created_at, updated_at)
      VALUES (${key}, ${kind}, ${recordId}, ${payload}::jsonb, ${etag}, now(), now())
      ON CONFLICT (record_key) DO UPDATE
      SET kind = EXCLUDED.kind, record_id = EXCLUDED.record_id,
          payload = EXCLUDED.payload, etag = EXCLUDED.etag, updated_at = now()
      RETURNING etag`;
    return { modified: rows.length === 1, etag: rows[0]?.etag ?? null };
  }

  async function get(key: string, _options: any = {}) {
    const rows = await sql`SELECT payload FROM public.win_memory_records WHERE record_key = ${key} LIMIT 1`;
    return rows[0]?.payload ?? null;
  }

  async function getWithMetadata(key: string, _options: any = {}) {
    const rows = await sql`SELECT payload, etag FROM public.win_memory_records WHERE record_key = ${key} LIMIT 1`;
    if (!rows.length) return null;
    return { data: rows[0].payload, etag: rows[0].etag };
  }

  async function* list(listOptions: any = {}) {
    const prefix = typeof listOptions.prefix === "string" ? listOptions.prefix : "";
    let cursor = "";
    while (true) {
      const rows = await sql`SELECT record_key FROM public.win_memory_records
        WHERE record_key LIKE ${prefix + "%"} AND record_key > ${cursor}
        ORDER BY record_key ASC LIMIT ${pageSize}`;
      if (!rows.length) return;
      yield { blobs: rows.map((row: any) => ({ key: row.record_key })) };
      cursor = rows[rows.length - 1].record_key;
      if (rows.length < pageSize) return;
    }
  }

  async function remove(key: string) {
    await sql`DELETE FROM public.win_memory_records WHERE record_key = ${key}`;
  }

  return {
    setJSON,
    get,
    getWithMetadata,
    list,
    delete: remove
  };
}
