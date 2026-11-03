/**
 * WIN research and learning isolation policy.
 * Human-origin coupon intelligence is never a Model Lab training source.
 */
export const WIN_RESEARCH_POLICY = {
  autonomousDiscovery: {
    enabledByDefault: true,
    mode: "public_metadata_only",
    automaticIngestion: false,
    automaticActivation: false,
    humanApprovalRequiredForAdapter: true,
    permittedMethods: [
      "documented public API",
      "licensed provider API",
      "open dataset download with compatible licence",
      "authorized user-provided export"
    ],
    prohibitedMethods: [
      "private groups or direct messages",
      "login or paywall bypass",
      "CAPTCHA bypass",
      "session-cookie reuse without authorization",
      "robots or provider-term evasion",
      "unlicensed redistribution"
    ],
    requiredEvidence: [
      "provider identity",
      "source URL or API endpoint",
      "retrievedAt timestamp",
      "licence or terms reference",
      "provider record ID",
      "raw payload checksum",
      "data domain and sport coverage"
    ]
  },
  learningLabs: {
    modelLabNamespace: "library/model-lab",
    humanCouponLabNamespace: "library/human-coupon-lab",
    modelTrainingAllowedOrigins: ["provider_historical_data", "win_frozen_predictions", "verified_event_results", "win_simulation"],
    modelTrainingForbiddenOrigins: ["human_coupon", "tipster_coupon", "community_consensus", "bookmaker_promotion"],
    humanCouponTrainingAllowedOrigins: ["human_coupon", "tipster_coupon", "community_consensus"],
    crossLabAccess: "read_only_comparison_only",
    promotionRequires: [
      "chronological_out_of_sample_test",
      "minimum_sample_threshold",
      "probability_calibration",
      "data_leakage_check",
      "independent_review",
      "reproducible_experiment"
    ]
  },
  agentEvolution: {
    allowAgentProposals: true,
    autoCreateProductionAgents: false,
    sandboxRequired: true,
    immutableVersionHistory: true,
    failedExperimentsRetained: true,
    promotionRequiresIndependentApproval: true
  }
} as const;

export function validateResearchEvidence(record: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const key of ["providerId","sourceUrl","retrievedAt","licenceReference","sportId","dataDomain","rawChecksum"]) {
    if (typeof record[key] !== "string" || !(record[key] as string).trim()) errors.push(key + "_required");
  }
  if (typeof record.sourceUrl === "string" && !record.sourceUrl.startsWith("https://")) errors.push("https_source_required");
  if (typeof record.retrievedAt === "string" && !Number.isFinite(Date.parse(record.retrievedAt))) errors.push("invalid_retrievedAt");
  if (record.origin === "human_coupon") errors.push("human_coupon_cannot_enter_model_lab");
  return errors;
}
