import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DATA_PROVIDER_REGISTRY,
  getProviderCandidates,
  providerMayRunAutomatically,
  assertProviderImportAllowed
} from "../netlify/lib/data-provider-registry.mts";
import { CONSENSUS_SOURCES, isPinnedDatasetRevision } from "../netlify/lib/consensus-market-adapter.mts";
import { isPinnedOpenFootballRevision } from "../netlify/lib/openfootball-adapter.mts";

test("TipsAudit is discoverable but cannot enter automated data ingestion", () => {
  const candidate = DATA_PROVIDER_REGISTRY.find(x => x.id === "tipsaudit-track-record-public");
  assert.ok(candidate, "the reviewed public data candidate must exist");
  assert.equal(candidate.accessMode, "research_candidate");
  assert.equal(candidate.licenceReview, "required");
  assert.equal(candidate.automationAllowed, false);
  assert.match(candidate.licenceReference, /^https:\/\//);
  assert.match(candidate.attribution, /TipsAudit/);
  assert.match(candidate.notes, /snapshot hash matches the manifest/);
  assert.match(candidate.notes, /captured before its kick-off/);
  assert.ok(candidate.sports.includes("football"));
  assert.ok(candidate.dataDomains.includes("historical_pre_match_predictions"));
  assert.ok(getProviderCandidates("football").some(x => x.id === candidate.id));

  const seeminglyValidConnection = {
    providerId: candidate.id,
    status: "connected",
    verifiedAt: "2026-11-04T00:00:00.000Z",
    enabledDomains: ["historical_pre_match_predictions"],
    termsReference: "https://github.com/tipsaudit/track-record-public/blob/main/LICENSE"
  };
  assert.equal(
    providerMayRunAutomatically(candidate, seeminglyValidConnection),
    false,
    "a research candidate cannot run even if a connection record is present"
  );
  assert.throws(
    () => assertProviderImportAllowed(candidate.id, ["historical_pre_match_predictions"]),
    /automation_disabled/,
    "the actual import gate must reject research-only candidates"
  );
});

test("every active public provider has an HTTPS licence reference and attribution", () => {
  for (const provider of DATA_PROVIDER_REGISTRY.filter(x => x.automationAllowed)) {
    assert.equal(provider.licenceReview, "approved", provider.id);
    assert.match(provider.licenceReference || "", /^https:\/\//, provider.id + " licence reference");
    assert.ok(provider.attribution?.trim(), provider.id + " attribution");
    assertProviderImportAllowed(provider.id, [provider.dataDomains[0]]);
  }
});

test("runtime import gate rejects unknown, disabled, wrong-mode and out-of-domain sources", () => {
  assert.throws(() => assertProviderImportAllowed("provider-does-not-exist"), /provider_not_registered/);
  assert.throws(() => assertProviderImportAllowed("sportmonks", ["fixtures"]), /automation_disabled/);
  assert.throws(() => assertProviderImportAllowed("tipsaudit-track-record-public"), /automation_disabled/);
  assert.throws(() => assertProviderImportAllowed("openfootball", ["live_odds"]), /data_domain_not_approved/);
  assert.throws(() => assertProviderImportAllowed("openfootball", ["fixtures", "results", "live_odds"]), /data_domain_not_approved/);
  assert.equal(assertProviderImportAllowed("openfootball-football-json", ["fixtures", "results"]).id, "openfootball");
});

test("registry changes immediately block a source before its adapter can fetch", () => {
  const provider = DATA_PROVIDER_REGISTRY.find(x => x.id === "hf-minmaxxxer-epl-2025-26");
  assert.ok(provider);
  const original = provider.automationAllowed;
  try {
    provider.automationAllowed = false;
    assert.throws(
      () => assertProviderImportAllowed(provider.id, ["historical_consensus_market_lines", "results"]),
      /automation_disabled/
    );
  } finally {
    provider.automationAllowed = original;
  }
});

test("each adapter checks registry policy before its first upstream operation", async () => {
  const [football, worldCup, consensus, sharp] = await Promise.all([
    readFile(new URL("../netlify/lib/openfootball-adapter.mts", import.meta.url), "utf8"),
    readFile(new URL("../netlify/lib/openfootball-worldcup-adapter.mts", import.meta.url), "utf8"),
    readFile(new URL("../netlify/lib/consensus-market-adapter.mts", import.meta.url), "utf8"),
    readFile(new URL("../netlify/lib/sharpapi-sample-adapter.mts", import.meta.url), "utf8")
  ]);

  const footballGate = football.indexOf('assertProviderImportAllowed("openfootball-football-json"');
  const footballStart = football.indexOf("export async function syncOpenFootballHistoricalData()");
  const footballFetch = football.indexOf('const root = await getJson(API + "?ref=" + sourceRevision)');
  assert.ok(footballGate > footballStart && footballGate < footballFetch);

  const worldCupStart = worldCup.indexOf("export async function syncOpenFootballWorldCupData()");
  const worldCupGate = worldCup.indexOf('assertProviderImportAllowed("openfootball-worldcup-json"');
  const worldCupFetch = worldCup.indexOf("for(let i=0;i<PATHS.length;i+=4)");
  assert.ok(worldCupGate > worldCupStart && worldCupGate < worldCupFetch);

  const consensusStart = consensus.indexOf("async function syncOne(source:");
  const consensusGate = consensus.indexOf("assertProviderImportAllowed(source.id,source.requiredDomains)");
  const consensusFetch = consensus.indexOf("const treeRes=await fetch(", consensusStart);
  assert.ok(consensusGate > consensusStart && consensusGate < consensusFetch);

  const sharpStart = sharp.indexOf("async function syncOne(file:");
  const sharpGate = sharp.indexOf('assertProviderImportAllowed("sharpapi-sample-data"');
  const sharpFetch = sharp.indexOf("const url=BASE+file.path,res=await fetch(", sharpStart);
  assert.ok(sharpGate > sharpStart && sharpGate < sharpFetch);
});

test("all 12 consensus datasets have unique, registry-approved sport and market mappings", () => {
  assert.equal(CONSENSUS_SOURCES.length, 12);
  const ids = new Set();
  const repositories = new Set();
  for (const source of CONSENSUS_SOURCES) {
    assert.equal(ids.has(source.id), false, source.id + " duplicate provider ID");
    assert.equal(repositories.has(source.repo), false, source.repo + " duplicate repository");
    ids.add(source.id);
    repositories.add(source.repo);
    assert.ok(source.requiredDomains.length > 0, source.id + " needs explicit required data domains");
    assertProviderImportAllowed(source.id, [...source.requiredDomains]);
    assert.match(source.repo, /^[a-z0-9-]+\/[a-z0-9-]+$/);
  }
});

test("credentialed provider connections are bound to the correct provider, terms and data domains", () => {
  const provider = DATA_PROVIDER_REGISTRY.find(x => x.id === "openfootball");
  assert.ok(provider);
  const valid = {
    providerId: provider.id,
    status: "connected",
    verifiedAt: "2026-11-04T00:00:00.000Z",
    enabledDomains: ["fixtures", "results"],
    termsReference: provider.licenceReference
  };
  assert.equal(providerMayRunAutomatically(provider, valid), true);
  assert.equal(providerMayRunAutomatically(provider, { ...valid, providerId: "sharpapi-sample-data" }), false);
  assert.equal(providerMayRunAutomatically(provider, { ...valid, verifiedAt: "not-a-date" }), false);
  assert.equal(providerMayRunAutomatically(provider, { ...valid, enabledDomains: [] }), false);
  assert.equal(providerMayRunAutomatically(provider, { ...valid, enabledDomains: ["live_odds"] }), false);
  assert.equal(providerMayRunAutomatically(provider, { ...valid, termsReference: "http://example.com/terms" }), false);
});

test("only explicitly approved HTTPS providers pass the credentialed automation policy", () => {
  const ids = new Set();
  for (const provider of DATA_PROVIDER_REGISTRY) {
    assert.equal(ids.has(provider.id), false, "provider IDs must be unique");
    ids.add(provider.id);
    if (provider.automationAllowed) {
      assert.equal(provider.licenceReview, "approved", provider.id + " needs approved licence review");
      assert.notEqual(provider.accessMode, "research_candidate");
      assert.match(provider.website, /^https:\/\//);
      const connection = {
        providerId: provider.id,
        status: "connected",
        verifiedAt: "2026-11-04T00:00:00.000Z",
        enabledDomains: provider.dataDomains,
        termsReference: provider.licenceReference
      };
      assert.equal(providerMayRunAutomatically(provider, connection), true, provider.id);
    }
  }
});

test("commercial and source-discovery-only providers remain disabled pending rights review", () => {
  for (const provider of DATA_PROVIDER_REGISTRY.filter(x => x.licenceReview === "required")) {
    assert.equal(provider.automationAllowed, false, provider.id);
  }
});

test("Hugging Face consensus imports require immutable 40-character revisions", () => {
  assert.equal(isPinnedDatasetRevision("0123456789abcdef0123456789abcdef01234567"), true);
  assert.equal(isPinnedDatasetRevision("main"), false);
  assert.equal(isPinnedDatasetRevision("latest"), false);
  assert.equal(isPinnedDatasetRevision("0123456789abcdef"), false);
  assert.equal(isPinnedDatasetRevision("g123456789abcdef0123456789abcdef01234567"), false);
});

test("consensus adapter pins both tree and raw downloads and skips unchanged revisions", async () => {
  const adapter = await readFile(new URL("../netlify/lib/consensus-market-adapter.mts", import.meta.url), "utf8");
  assert.ok(adapter.includes("/revision/main"));
  assert.ok(adapter.includes('/tree/"+sourceRevision+"'));
  assert.ok(adapter.includes('/resolve/"+sourceRevision+"/'));
  assert.ok(adapter.includes('existing?.sourceRevision===sourceRevision'));
  assert.ok(adapter.includes('status:"unchanged"'));
  assert.ok(adapter.includes("sourceCommitUrl"));
  assert.ok(!adapter.includes("/tree/main?recursive=true"));
  assert.ok(!adapter.includes("/resolve/main/"));
});

test("OpenFootball historical imports require immutable Git commit revisions", () => {
  assert.equal(isPinnedOpenFootballRevision("0123456789abcdef0123456789abcdef01234567"), true);
  assert.equal(isPinnedOpenFootballRevision("master"), false);
  assert.equal(isPinnedOpenFootballRevision("main"), false);
  assert.equal(isPinnedOpenFootballRevision("short"), false);
});

test("OpenFootball historical adapter pins contents and raw URLs and reuses completed unchanged snapshots", async () => {
  const adapter = await readFile(new URL("../netlify/lib/openfootball-adapter.mts", import.meta.url), "utf8");
  assert.ok(adapter.includes("/commits/master"));
  assert.ok(adapter.includes('API + "?ref=" + sourceRevision'));
  assert.ok(adapter.includes('API + "/" + season + "?ref=" + sourceRevision'));
  assert.ok(adapter.includes('RAW + "/" + sourceRevision + "/"'));
  assert.ok(adapter.includes('previous?.sourceRevision === sourceRevision'));
  assert.ok(adapter.includes('previous?.status === "completed"'));
  assert.ok(adapter.includes('status: "unchanged"'));
  assert.ok(adapter.includes("sourceCommitUrl"));
  assert.ok(!adapter.includes("football.json/master/"));
});
