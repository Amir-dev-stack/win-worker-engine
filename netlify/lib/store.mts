// Netlify Blobs remains the production store. The optional adapter is only
// installable in an explicitly flagged test process and keeps integration
// fixtures away from every production collection.
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

async function store(): Promise<StoreAdapter> {
  if (isolatedTestStore) return isolatedTestStore;

  // Neon is deliberately opt-in. If selected, missing credentials or a failed
  // Neon connection must fail closed; transactional namespaces never fall
  // back to Blobs behind the owner's back.
  if (process.env.WIN_TRANSACTIONAL_STORE === "neon") {
    const databaseUrl = process.env.WIN_NEON_DATABASE_URL || "";
    if (!databaseUrl) throw new Error("WIN_TRANSACTIONAL_STORE=neon requires WIN_NEON_DATABASE_URL.");
    const { neon } = await import("@neondatabase/serverless");
    const { createNeonStore } = await import("./neon-store.mts");
    return createNeonStore(neon(databaseUrl)) as unknown as StoreAdapter;
  }

  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: "win-engine", region: "eu-central-1", consistency: "strong" }) as unknown as StoreAdapter;
}

const key = (kind: string, id: string) => kind + "/" + id;

export async function put(kind: string, id: string, value: unknown) {
  await (await store()).setJSON(key(kind, id), value);
  return value;
}
export async function get<T>(kind: string, id: string): Promise<T | null> {
  return await (await store()).get(key(kind, id), { type: "json" }) as T | null;
}
export async function list<T>(kind: string, limit = 100): Promise<T[]> {
  // Netlify Blobs list() fetches every page by default. Ask for an iterator
  // and stop after the requested sample so large collections cannot turn a
  // small dashboard read into an unbounded metadata scan.
  const maxItems = Math.max(0, Math.floor(limit));
  if (maxItems === 0) return [];
  const backend = await store();
  const selected: Array<{ key: string }> = [];
  for await (const page of backend.list({ prefix: kind + "/", paginate: true })) {
    for (const item of page.blobs) {
      selected.push(item);
      if (selected.length >= maxItems) break;
    }
    if (selected.length >= maxItems) break;
  }
  selected.reverse();
  const rows: T[] = [];
  // Bounded parallel reads keep each requested sample responsive without
  // flooding Blobs or downloading records that the caller did not request.
  const batchSize = 16;
  for (let offset = 0; offset < selected.length; offset += batchSize) {
    const batch = selected.slice(offset, offset + batchSize);
    const values = await Promise.all(batch.map(item =>
      backend.get(item.key, { type: "json" }) as Promise<T | null>
    ));
    for (const value of values) if (value !== null) rows.push(value);
  }
  return rows;
}
export async function append(kind: string, id: string, value: unknown) {
  return put(kind, id, value);
}
export async function remove(kind: string, id: string) {
  await (await store()).delete(key(kind, id));
}

/** Atomic, single-key conditional helpers for review-operation claims. */
export async function putIfNew(kind: string, id: string, value: unknown) {
  return await (await store()).setJSON(key(kind, id), value, { onlyIfNew: true });
}
export async function putIfMatch(kind: string, id: string, value: unknown, etag: string) {
  return await (await store()).setJSON(key(kind, id), value, { onlyIfMatch: etag });
}
export async function getWithMetadata<T>(kind: string, id: string): Promise<{ value: T; etag: string } | null> {
  const result = await (await store()).getWithMetadata(key(kind, id), { type: "json", consistency: "strong" });
  if (!result) return null;
  return { value: result.data as T, etag: result.etag };
}
