import { getStore } from "@netlify/blobs";

// Strong consistency ensures a queued run is immediately visible to its
// background worker, which may start on a different function instance.
const store = () => getStore({ name: "win-engine", region: "eu-central-1", consistency: "strong" });
const key = (kind: string, id: string) => kind + "/" + id;

export async function put(kind: string, id: string, value: unknown) {
  await store().setJSON(key(kind, id), value);
  return value;
}
export async function get<T>(kind: string, id: string): Promise<T | null> {
  return await store().get(key(kind, id), { type: "json" }) as T | null;
}
export async function list<T>(kind: string, limit = 100): Promise<T[]> {
  const result = await store().list({ prefix: kind + "/" });
  const rows: T[] = [];
  for (const item of result.blobs.slice(0, limit).reverse()) {
    const value = await store().get(item.key, { type: "json" }) as T | null;
    if (value !== null) rows.push(value);
  }
  return rows;
}
export async function append(kind: string, id: string, value: unknown) {
  return put(kind, id, value);
}
export async function remove(kind: string, id: string) {
  await store().delete(key(kind, id));
}


/** Atomic, single-key conditional helpers for review-operation claims. */
export async function putIfNew(kind: string, id: string, value: unknown) {
  return await store().setJSON(key(kind, id), value, { onlyIfNew: true });
}
export async function putIfMatch(kind: string, id: string, value: unknown, etag: string) {
  return await store().setJSON(key(kind, id), value, { onlyIfMatch: etag });
}
export async function getWithMetadata<T>(kind: string, id: string): Promise<{ value: T; etag: string } | null> {
  const result = await store().getWithMetadata(key(kind, id), { type: "json", consistency: "strong" });
  if (!result) return null;
  return { value: result.data as T, etag: result.etag };
}
