import { DATA_PROVIDER_REGISTRY, type ProviderRecord } from "./data-provider-registry.mts";

const RESULT_DOMAIN_PATTERN = /(^|_)(results?|settled_results?|match_results?)(_|$)/i;

export type WinSourceReviewQueueEntry = {
  providerId: string;
  providerName: string;
  website: string;
  sportIds: string[];
  resultDomains: string[];
  rolloutTrack: "football_first" | "later_sport";
  reviewStatus: "unreviewed";
  identityVerified: false;
  upstreamOwnerId: null;
  feedProductId: null;
  independenceGroup: null;
  evidenceRequired: readonly string[];
};

const EVIDENCE_REQUIRED = Object.freeze([
  "primary_publisher_ownership_evidence",
  "exact_feed_or_dataset_product_identity",
  "upstream_data_origin_and_republication_chain",
  "result_definition_and_settlement_semantics",
  "source_revision_and_snapshot_provenance",
  "licence_and_training_use_rights"
] as const);

function resultDomains(provider: ProviderRecord): string[] {
  return provider.dataDomains.filter(domain => RESULT_DOMAIN_PATTERN.test(domain)).sort();
}

/**
 * Read-only queue derived from the server-owned provider catalogue.
 * It deliberately contains no guessed ownership or independence assignments.
 * Queue membership is not source approval, connection, ingestion permission,
 * or training approval.
 */
export function getWinSourceReviewQueue(): WinSourceReviewQueueEntry[] {
  return DATA_PROVIDER_REGISTRY
    .map(provider => ({ provider, domains: resultDomains(provider) }))
    .filter(item => item.domains.length > 0)
    .map(({ provider, domains }) => ({
      providerId: provider.id,
      providerName: provider.name,
      website: provider.website,
      sportIds: [...provider.sports].sort(),
      resultDomains: domains,
      rolloutTrack: provider.sports.includes("football") ? "football_first" : "later_sport",
      reviewStatus: "unreviewed" as const,
      identityVerified: false as const,
      upstreamOwnerId: null,
      feedProductId: null,
      independenceGroup: null,
      evidenceRequired: EVIDENCE_REQUIRED
    }))
    .sort((a, b) => a.rolloutTrack.localeCompare(b.rolloutTrack) || a.providerId.localeCompare(b.providerId));
}


export type WinFootballSourceCoverageArea =
  | "fixtures_and_results"
  | "odds_and_markets"
  | "team_and_player_statistics"
  | "predictions_and_probabilities"
  | "lineups_and_availability"
  | "other";

export type WinFootballSourceInventoryEntry = {
  providerId: string;
  providerName: string;
  website: string;
  accessMode: ProviderRecord["accessMode"];
  licenceReview: ProviderRecord["licenceReview"];
  automationAllowed: boolean;
  historicalSupport: ProviderRecord["historicalSupport"];
  dataDomains: string[];
  coverageAreas: WinFootballSourceCoverageArea[];
  connectionStatus: "registry_only_not_connected";
  trainingStatus: "not_approved";
};

function classifyFootballDomain(domain: string): WinFootballSourceCoverageArea {
  if (/(fixture|result|settled_result|match_result)/i.test(domain)) return "fixtures_and_results";
  if (/(odds|market|price|spread|totals|handicap|btts)/i.test(domain)) return "odds_and_markets";
  if (/(statistic|standing|ranking|performance|event|goal|booking|substitution)/i.test(domain)) return "team_and_player_statistics";
  if (/(prediction|probabilit|forecast|consensus)/i.test(domain)) return "predictions_and_probabilities";
  if (/(lineup|injur|availability|squad|player)/i.test(domain)) return "lineups_and_availability";
  return "other";
}

/**
 * Football-first source inventory for coupon research planning.
 * Registry metadata describes candidates only: no entry implies a live connection,
 * validated coverage, legal clearance, or permission to train.
 */
export function getWinFootballSourceInventory(): WinFootballSourceInventoryEntry[] {
  return DATA_PROVIDER_REGISTRY
    .filter(provider => provider.sports.includes("football"))
    .map(provider => ({
      providerId: provider.id,
      providerName: provider.name,
      website: provider.website,
      accessMode: provider.accessMode,
      licenceReview: provider.licenceReview,
      automationAllowed: provider.automationAllowed,
      historicalSupport: provider.historicalSupport,
      dataDomains: [...provider.dataDomains].sort(),
      coverageAreas: [...new Set(provider.dataDomains.map(classifyFootballDomain))].sort(),
      connectionStatus: "registry_only_not_connected" as const,
      trainingStatus: "not_approved" as const
    }))
    .sort((a, b) => a.providerId.localeCompare(b.providerId));
}
