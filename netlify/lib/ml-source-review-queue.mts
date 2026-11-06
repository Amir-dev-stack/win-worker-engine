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
