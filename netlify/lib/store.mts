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
  // Netlify Blobs list() fetches every page by default. Ask for an iterator
  // and stop after the requested sample so large collections cannot turn a
  // small dashboard read into an unbounded metadata scan.
  const maxItems = Math.max(0, Math.floor(limit));
  if (maxItems === 0) return [];
  const selected: Array<{ key: string }> = [];
  for await (const page of store().list({ prefix: kind + "/", paginate: true })) {
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
      store().get(item.key, { type: "json" }) as Promise<T | null>
    ));
    for (const value of values) if (value !== null) rows.push(value);
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
