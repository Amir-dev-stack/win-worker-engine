// WIN keeps Netlify Blobs as the default durable store. Set WIN_MEMORY_BACKEND=mirror
// to dual-write Blobs + Neon during validation, then "neon" to make PostgreSQL
// primary while retaining Blobs as a replica. Never switch before backfill/verification.
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

async function stores(): Promise<{ primary: StoreAdapter; secondary: StoreAdapter | null }> {
  if (isolatedTestStore) return { primary: isolatedTestStore, secondary: null };
  const mode = memoryMode();
  if (mode === "blobs") return { primary: await blobsStore(), secondary: null };
  if (mode === "mirror") return { primary: await blobsStore(), secondary: await neonStore() };
  return { primary: await neonStore(), secondary: await blobsStore() };
}

const key = (kind: string, id: string) => kind + "/" + id;

export async function put(kind: string, id: string, value: unknown) {
  const { primary, secondary } = await stores();
  await primary.setJSON(key(kind, id), value);
  if (secondary) await secondary.setJSON(key(kind, id), value);
  return value;
}

export async function get<T>(kind: string, id: string): Promise<T | null> {
  const { primary, secondary } = await stores();
  const recordKey = key(kind, id);
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
  const { primary, secondary } = await stores();
  await primary.delete(key(kind, id));
  if (secondary) await secondary.delete(key(kind, id));
}

/** Atomic, single-key conditional helpers for review-operation claims. */
export async function putIfNew(kind: string, id: string, value: unknown) {
  const { primary, secondary } = await stores();
  const result = await primary.setJSON(key(kind, id), value, { onlyIfNew: true });
  if (result?.modified && secondary) await secondary.setJSON(key(kind, id), value);
  return result;
}

export async function putIfMatch(kind: string, id: string, value: unknown, etag: string) {
  const { primary, secondary } = await stores();
  const result = await primary.setJSON(key(kind, id), value, { onlyIfMatch: etag });
  if (result?.modified && secondary) await secondary.setJSON(key(kind, id), value);
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
