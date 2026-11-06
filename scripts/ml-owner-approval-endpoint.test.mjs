import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { WIN_ML_DATASET_MANIFEST_VERSION } from "../netlify/lib/ml-data-contract.mts";
import { canonicalizeWinMLProvenance } from "../netlify/lib/ml-provenance.mts";
import { hashWinMLLicenceEvidence } from "../netlify/lib/ml-licence-evidence.mts";

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function createMemoryStore() {
  const records = new Map();
  let revision = 0;
  return {
    records,
    async setJSON(key, value, options = {}) {
      const existing = records.get(key);
      if (options.onlyIfNew && existing) return { modified: false, etag: existing.etag };
      const etag = "owner-endpoint-etag-" + (++revision);
      records.set(key, { value: clone(value), etag });
      return { modified: true, etag };
    },
    async get(key) { const item = records.get(key); return item ? clone(item.value) : null; },
    async getWithMetadata(key) { const item = records.get(key); return item ? { data: clone(item.value), etag: item.etag } : null; },
    async delete(key) { records.delete(key); },
    async *list({ prefix = "" } = {}) {
      yield { blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

test("owner approval endpoint fails closed and accepts only a separately authenticated signed approval", async () => {
  const previousFlag = process.env.WIN_STORE_TEST_MODE;
  const previousNetlify = globalThis.Netlify;
  process.env.WIN_STORE_TEST_MODE = "1";
  const memoryStore = createMemoryStore();
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const token = "owner-control-token-" + "x".repeat(40);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const values = {
    WIN_ML_OWNER_APPROVAL_TOKEN: token,
    WIN_ML_OWNER_APPROVAL_PUBLIC_KEY: publicKeyPem,
    WIN_ML_OWNER_REVIEWER_ID: "owner:amir"
  };
  globalThis.Netlify = { env: { get: name => values[name] || "" } };

  try {
    const store = await import("../netlify/lib/store.mts");
    store.installIsolatedTestStore(memoryStore);
    const datasets = await import("../netlify/lib/ml-dataset-registry.mts");
    const endpoint = (await import("../netlify/functions/ml-owner-approval.mts")).default;
    const datasetId = "owner-endpoint-football";
    const datasetHash = "d".repeat(64);
    await datasets.registerWinMLDatasetManifest({
      manifestVersion: WIN_ML_DATASET_MANIFEST_VERSION, datasetId, providerId: "reviewed-source",
      sport: "association_football", competition: "test-league", season: "2026",
      sourceUrl: "https://example.test/results", licenceId: "CC0-1.0",
      attributionRequired: false, automationAllowed: false, approvedForTraining: false,
      permittedUse: "training", rowGrain: "match", eventTimePrecision: "instant",
      retrievedAt: "2026-11-06T08:00:00.000Z", rowCount: 100, labeledRowCount: 100,
      schemaVersion: "football.match.v2", contentSha256: datasetHash
    });

    const unauthorized = await endpoint(new Request("https://win.test/api/ml-owner-approval", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + "z".repeat(token.length) },
      body: JSON.stringify({ action: "status", approvalId: "missing" })
    }));
    assert.equal(unauthorized.status, 401);

    const licencePayload = {
      evidenceVersion: "win.ml.licence-review.v1", evidenceId: "endpoint-licence-review-1",
      licenceId: "CC0-1.0", sourceUrl: "https://example.test/licence",
      sourceDocumentSha256: "f".repeat(64), reviewedUse: "training", reviewerId: "owner:amir",
      reviewedAt: "2026-11-05T08:00:00.000Z", reviewExpiresAt: "2027-11-05T08:00:00.000Z",
      rationale: "Reviewed source terms and confirmed training permission."
    };
    const licenceEvidence = {
      payload: licencePayload,
      signatureBase64: sign(null, Buffer.from(canonicalizeWinMLProvenance(licencePayload)), privateKey).toString("base64")
    };
    const licenceRegistered = await endpoint(new Request("https://win.test/api/ml-owner-approval", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ action: "licence_evidence", evidence: licenceEvidence })
    }));
    assert.equal(licenceRegistered.status, 200);
    const licenceEvidenceSha256 = hashWinMLLicenceEvidence(licencePayload);

    const payload = {
      approvalVersion: "win.ml.owner-training-approval.v1", approvalId: "endpoint-approval-1",
      datasetId, datasetContentSha256: datasetHash, licenceId: "CC0-1.0",
      licenceEvidenceSha256, scope: "training", reviewerId: "owner:amir",
      approvedAt: "2020-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z"
    };
    const evidence = {
      payload,
      signatureBase64: sign(null, Buffer.from(canonicalizeWinMLProvenance(payload)), privateKey).toString("base64")
    };
    const approved = await endpoint(new Request("https://win.test/api/ml-owner-approval", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ action: "approve", evidence })
    }));
    assert.equal(approved.status, 200);
    assert.equal((await approved.json()).recorded, true);

    const status = await endpoint(new Request("https://win.test/api/ml-owner-approval", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ action: "status", approvalId: payload.approvalId })
    }));
    assert.equal(status.status, 200);
    assert.equal((await status.json()).status, "active");

    const readiness = await endpoint(new Request("https://win.test/api/ml-owner-approval", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ action: "readiness", datasetId, approvalId: payload.approvalId })
    }));
    assert.equal(readiness.status, 200);
    const readinessBody = await readiness.json();
    assert.equal(readinessBody.evidenceReady, true);
    assert.equal(readinessBody.modelFittingAllowed, false);

    const inventory = await endpoint(new Request("https://win.test/api/ml-owner-approval", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ action: "list", limit: 10 })
    }));
    assert.equal(inventory.status, 200);
    const inventoryBody = await inventory.json();
    assert.equal(inventoryBody.count, 1);
    assert.equal(inventoryBody.approvals[0].status, "active");

    assert.ok([...memoryStore.records.keys()].every(key =>
      key.startsWith("library/ml-dataset-manifests/") ||
      key.startsWith("library/ml-licence-review-evidence/") ||
      key.startsWith("library/ml-licence-review-evidence-ids/") ||
      key.startsWith("library/ml-owner-training-approvals/")));
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
    if (previousNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previousNetlify;
  }
});

test("owner approval endpoint requires protected configuration and bounded JSON requests", async () => {
  const previousNetlify = globalThis.Netlify;
  const token = "owner-control-token-" + "x".repeat(40);
  const publicKeyPem = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  const values = {
    WIN_ML_OWNER_APPROVAL_TOKEN: token,
    WIN_ML_OWNER_APPROVAL_PUBLIC_KEY: publicKeyPem,
    WIN_ML_OWNER_REVIEWER_ID: "owner:amir"
  };
  globalThis.Netlify = { env: { get: name => values[name] || "" } };
  try {
    const endpoint = (await import("../netlify/functions/ml-owner-approval.mts")).default;
    values.WIN_ML_OWNER_APPROVAL_TOKEN = "";
    const missingConfig = await endpoint(new Request("https://win.test/api/ml-owner-approval", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}"
    }));
    assert.equal(missingConfig.status, 503);
    values.WIN_ML_OWNER_APPROVAL_TOKEN = token;

    const wrongType = await endpoint(new Request("https://win.test/api/ml-owner-approval", {
      method: "POST", headers: { authorization: "Bearer " + token, "content-type": "text/plain" }, body: "{}"
    }));
    assert.equal(wrongType.status, 415);
    const tooLarge = await endpoint(new Request("https://win.test/api/ml-owner-approval", {
      method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ data: "x".repeat(70_000) })
    }));
    assert.equal(tooLarge.status, 413);
    const wrongMethod = await endpoint(new Request("https://win.test/api/ml-owner-approval", { method: "GET" }));
    assert.equal(wrongMethod.status, 405);
  } finally {
    if (previousNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previousNetlify;
  }
});
