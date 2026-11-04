import test from "node:test";
import assert from "node:assert/strict";
import { syncSkillCornerBasketballAggregates } from "../netlify/lib/skillcorner-basketball-adapter.mts";
import { DATA_PROVIDER_REGISTRY } from "../netlify/lib/data-provider-registry.mts";

test("SkillCorner remains manual-only and requires exact owner confirmation before any download", async () => {
  const provider = DATA_PROVIDER_REGISTRY.find(item => item.id === "skillcorner-open-basketball-acb-2025-26");
  assert.ok(provider);
  assert.equal(provider.accessMode, "manual_authorized_import");
  assert.equal(provider.authentication, "none");
  assert.equal(provider.licenceReview, "documented_open_terms");
  assert.equal(provider.automationAllowed, false);
  assert.match(provider.licenceReference, /^https:\/\//);
  assert.match(provider.attribution, /SkillCorner/);
  await assert.rejects(
    () => syncSkillCornerBasketballAggregates({}),
    /owner confirmation/
  );
  await assert.rejects(
    () => syncSkillCornerBasketballAggregates({ confirmResearchUse: "wrong" }),
    /owner confirmation/
  );
});
