import test from "node:test";
import assert from "node:assert/strict";
import {
  DATA_PROVIDER_REGISTRY,
  getProviderCandidates,
  providerMayRunAutomatically
} from "../netlify/lib/data-provider-registry.mts";

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
});

test("only explicitly approved, HTTPS providers can pass the automation policy", () => {
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
        termsReference: "https://example.com/provider-terms"
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
