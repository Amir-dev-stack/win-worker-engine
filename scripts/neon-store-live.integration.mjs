import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createNeonStore } from "../netlify/lib/neon-store.mts";

const connectionString = process.env.WIN_NEON_TEST_DATABASE_URL;
if (!connectionString || process.env.WIN_NEON_TEST_CONFIRM !== "1") {
  throw new Error(
    "Refusing live Neon integration test. Set WIN_NEON_TEST_DATABASE_URL to the dedicated test-branch connection string and WIN_NEON_TEST_CONFIRM=1."
  );
}

const sql = neon(connectionString);
const store = createNeonStore(sql);
const prefix = "win-neon-integration-" + randomUUID();
const claimKey = "integration-claim/" + prefix;
const casKey = "integration-cas/" + prefix;
const plainKey = "integration-record/" + prefix;

try {
  const claims = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      store.setJSON(claimKey, { index }, { onlyIfNew: true })
    )
  );
  assert.equal(claims.filter(result => result.modified).length, 1,
    "exactly one concurrent create-only claim must win");

  const initial = await store.setJSON(casKey, { version: 0 });
  assert.equal(initial.modified, true);
  const current = await store.getWithMetadata(casKey);
  assert.ok(current?.etag, "the stored row must expose an ETag");

  const updates = await Promise.all([
    store.setJSON(casKey, { version: 1, contender: "a" }, { onlyIfMatch: current.etag }),
    store.setJSON(casKey, { version: 1, contender: "b" }, { onlyIfMatch: current.etag })
  ]);
  assert.equal(updates.filter(result => result.modified).length, 1,
    "exactly one concurrent ETag compare-and-swap must win");

  await store.setJSON(plainKey, { marker: prefix, verified: true });
  assert.deepEqual(await store.get(plainKey), { marker: prefix, verified: true });

  const metadata = await store.getWithMetadata(plainKey);
  assert.equal(metadata?.data?.marker, prefix);
  assert.ok(metadata?.etag);

  const listed = [];
  for await (const page of store.list({ prefix: "integration-record/" + prefix })) {
    listed.push(...page.blobs.map(blob => blob.key));
  }
  assert.deepEqual(listed, [plainKey]);

  console.log("WIN_NEON_INTEGRATION_OK: concurrent create-only, CAS, read, metadata and prefix listing verified.");
} finally {
  await Promise.allSettled([
    store.delete(claimKey),
    store.delete(casKey),
    store.delete(plainKey)
  ]);
}
