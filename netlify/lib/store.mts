// WIN keeps Netlify Blobs as the default durable store. Set WIN_MEMORY_BACKEND=mirror
// to dual-write curated memory to Neon during validation, then "neon" only after
// a complete backfill and reconciliation. Large raw match/event datasets stay in Blobs.
type StoreAdapter = {
  setJSON(key: string, value: unknown, options?: any): Promise<any>;
  get(key: string, options?: any): Promise<any>;
  list(options?: any): AsyncIterable<{ blobs: Array<{ key: string }> }>;
  delete(key: string): Promise<any>;
  getWithMetadata(key: string, options?: any): Promise<any>;
};

let isolatedTestStore: StoreAdapter | null = null;

export function installIsolatedTestStore(adapter: StoreAdapter) {
  if (process.env.WIN_STORE_TEST_MODE !== "1") {
    throw new Error("The isolated WIN store is available only when WIN_STORE_TEST_MODE=1.");
  }
  if (!adapter || typeof adapter.setJSON !== "function" ||
      typeof adapter.get !== "function" || typeof adapter.list !== "function" ||
      typeof adapter.delete !== "function" || typeof adapter.getWithMetadata !== "function") {
    throw new Error("The isolated WIN store adapter is incomplete.");
  }
  if (isolatedTestStore && isolatedTestStore !== adapter) {
    throw new Error("An isolated WIN store adapter is already installed in this process.");
  }
  isolatedTestStore = adapter;
}

const memoryMode = () => {
  const mode = process.env.WIN_MEMORY_BACKEND?.trim().toLowerCase() || "blobs";
  if (!["blobs", "mirror", "neon"].includes(mode)) {
    throw new Error("WIN_MEMORY_BACKEND must be blobs, mirror, or neon.");
  }
  return mode;
};

async function blobsStore(): Promise<StoreAdapter> {
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: "win-engine", region: "eu-central-1", consistency: "strong" }) as unknown as StoreAdapter;
}

async function neonStore(): Promise<StoreAdapter> {
  const { getNeonStore } = await import("./neon-store.mts");
  return getNeonStore() as unknown as StoreAdapter;
}

const MIRRORED_MEMORY_PREFIXES = [
  "library/agent-profiles/",
  "library/persistent-agent-profiles/",
  "library/agent-observations/",
  "library/agent-notes/",
  "library/agent-task-queue/",
  "library/agent-proposals/",
  "library/agent-sandbox-evaluations/",
  "library/entity-profiles/",
  "library/lessons/",
  "library/lesson-review-cases/",
  "library/settlement-learning/",
  "library/settlement-learning-cases/",
  "library/settled-results/",
  "library/frozen-predictions/",
  "library/research-runs/",
  "library/coupons/",
  "library/winning-coupons/",
  "library/losing-coupons/",
  "library/pending-coupons/",
  "library/coupon-history/",
  "library/coupon-research-cases/",
  "library/win-coupon-candidates/",
  "library/learning-cycles/"
];

function isStructuredMemoryKey(recordKey: string) {
  return MIRRORED_MEMORY_PREFIXES.some(prefix => recordKey.startsWith(prefix));
}

async function stores(recordKey?: string): Promise<{ primary: StoreAdapter; secondary: StoreAdapter | null }> {
  if (isolatedTestStore) return { primary: isolatedTestStore, secondary: null };
  const mode = memoryMode();
  const mirrorable = recordKey ? isStructuredMemoryKey(recordKey) : false;

  // Raw event datasets, source payloads and other non-memory collections remain
  // exclusively in Blobs even after the structured-memory cutover.
  if (mode === "blobs" || (mode === "neon" && !mirrorable)) {
    return { primary: await blobsStore(), secondary: null };
  }
  if (mode === "mirror") {
    return { primary: await blobsStore(), secondary: mirrorable ? await neonStore() : null };
  }
  return { primary: await neonStore(), secondary: await blobsStore() };
}

const key = (kind: string, id: string) => kind + "/" + id;

export async function put(kind: string, id: string, value: unknown) {
  const recordKey = key(kind, id);
  const { primary, secondary } = await stores(recordKey);
  await primary.setJSON(recordKey, value);
  if (secondary) await secondary.setJSON(recordKey, value);
  return value;
}

export async function get<T>(kind: string, id: string): Promise<T | null> {
  const recordKey = key(kind, id);
  const { primary, secondary } = await stores(recordKey);
  const value = await primary.get(recordKey, { type: "json" }) as T | null;
  if (value !== null && value !== undefined) return value;
  return secondary ? await secondary.get(recordKey, { type: "json" }) as T | null : null;
}

export async function list<T>(kind: string, limit = 100): Promise<T[]> {
  const maxItems = Math.max(0, Math.floor(limit));
  if (maxItems === 0) return [];
  const { primary, secondary } = await stores(kind + "/");
  const selected: Array<{ key: string }> = [];
  const seen = new Set<string>();
  const collect = async (backend: StoreAdapter) => {
    for await (const page of backend.list({ prefix: kind + "/", paginate: true })) {
      for (const item of page.blobs) {
        if (!seen.has(item.key)) {
          seen.add(item.key);
          selected.push(item);
        }
        if (selected.length >= maxItems) return;
      }
    }
  };
  await collect(primary);
  if (secondary && selected.length < maxItems) await collect(secondary);
  selected.reverse();

  const rows: T[] = [];
  const batchSize = 16;
  for (let offset = 0; offset < selected.length; offset += batchSize) {
    const batch = selected.slice(offset, offset + batchSize);
    const values = await Promise.all(batch.map(async item => {
      const primaryValue = await primary.get(item.key, { type: "json" }) as T | null;
      if (primaryValue !== null && primaryValue !== undefined) return primaryValue;
      return secondary ? await secondary.get(item.key, { type: "json" }) as T | null : null;
    }));
    for (const value of values) if (value !== null) rows.push(value);
  }
  return rows;
}

export async function append(kind: string, id: string, value: unknown) {
  return put(kind, id, value);
}

export async function remove(kind: string, id: string) {
  const recordKey = key(kind, id);
  const { primary, secondary } = await stores(recordKey);
  await primary.delete(recordKey);
  if (secondary) await secondary.delete(recordKey);
}

/** Atomic, single-key conditional helpers for review-operation claims. */
export async function putIfNew(kind: string, id: string, value: unknown) {
  const recordKey = key(kind, id);
  const { primary, secondary } = await stores(recordKey);
  const result = await primary.setJSON(recordKey, value, { onlyIfNew: true });
  if (result?.modified && secondary) await secondary.setJSON(recordKey, value);
  return result;
}

export async function putIfMatch(kind: string, id: string, value: unknown, etag: string) {
  const recordKey = key(kind, id);
  const { primary, secondary } = await stores(recordKey);
  const result = await primary.setJSON(recordKey, value, { onlyIfMatch: etag });
  if (result?.modified && secondary) await secondary.setJSON(recordKey, value);
  return result;
}

export async function getWithMetadata<T>(kind: string, id: string): Promise<{ value: T; etag: string } | null> {
  const recordKey = key(kind, id);
  const { primary, secondary } = await stores(recordKey);
  const result = await primary.getWithMetadata(recordKey, { type: "json", consistency: "strong" });
  if (result) return { value: result.data as T, etag: result.etag };
  const fallback = secondary ? await secondary.getWithMetadata(recordKey, { type: "json", consistency: "strong" }) : null;
  if (!fallback) return null;
  return { value: fallback.data as T, etag: fallback.etag };
}

/** Diagnostic metadata only; never returns a connection string or credential. */
export function getMemoryBackendMode() {
  return memoryMode();
}
