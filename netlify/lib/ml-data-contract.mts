export const WIN_ML_DATASET_MANIFEST_VERSION = "win.ml.dataset.v1" as const;
export type WinMLPermittedUse = "training" | "research_only" | "benchmark_only" | "blocked";
export type WinMLEventTimePrecision = "instant" | "date" | "unknown";
export type WinMLRowGrain = "match" | "player_match" | "event" | "market_snapshot";
export type WinMLDatasetManifestV1 = {
  manifestVersion: typeof WIN_ML_DATASET_MANIFEST_VERSION; datasetId: string; providerId: string;
  sport: string; competition: string; season: string; sourceUrl: string; licenceId: string;
  attributionRequired: boolean; attributionText?: string; automationAllowed: boolean;
  approvedForTraining: boolean; permittedUse: WinMLPermittedUse; rowGrain: WinMLRowGrain;
  eventTimePrecision: WinMLEventTimePrecision; retrievedAt: string; rowCount: number;
  labeledRowCount: number; schemaVersion: string; contentSha256: string;
};
export type WinMLFeatureValue = { value: number | string | boolean | null; availableAt: string; sourceId: string };
export type WinMLTrainingExampleV1 = {
  datasetId: string; sourceRecordId: string; eventId: string; eventStart: string; predictionCutoff: string;
  features: Record<string, WinMLFeatureValue>;
  label: { market: "1x2" | "total_goals"; outcome: "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER" | "PUSH" | "VOID"; settlementRuleId: string; settledAt: string };
};
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function validTimestamp(value: unknown): value is string { return nonEmpty(value) && Number.isFinite(Date.parse(value)); }
function validSha256(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value); }

/** Validate the immutable source/provenance envelope before a dataset can enter an experiment. */
export function validateWinMLDatasetManifest(manifest: WinMLDatasetManifestV1): string[] {
  const errors: string[] = [];
  if (!manifest || manifest.manifestVersion !== WIN_ML_DATASET_MANIFEST_VERSION) errors.push("unsupported_manifest_version");
  for (const [field, value] of Object.entries({
    datasetId: manifest?.datasetId, providerId: manifest?.providerId, sport: manifest?.sport,
    competition: manifest?.competition, season: manifest?.season, licenceId: manifest?.licenceId,
    schemaVersion: manifest?.schemaVersion
  })) if (!nonEmpty(value)) errors.push(field + "_required");
  try { const url = new URL(manifest?.sourceUrl || ""); if (url.protocol !== "https:") errors.push("source_url_must_be_https"); }
  catch { errors.push("source_url_invalid"); }
  if (typeof manifest?.attributionRequired !== "boolean" || typeof manifest?.automationAllowed !== "boolean" ||
      typeof manifest?.approvedForTraining !== "boolean") errors.push("licence_permissions_required");
  if (manifest?.attributionRequired === true && !nonEmpty(manifest?.attributionText)) errors.push("required_attribution_missing");
  if (!["training", "research_only", "benchmark_only", "blocked"].includes(manifest?.permittedUse)) errors.push("permitted_use_invalid");
  if (!["match", "player_match", "event", "market_snapshot"].includes(manifest?.rowGrain)) errors.push("row_grain_invalid");
  if (!["instant", "date", "unknown"].includes(manifest?.eventTimePrecision)) errors.push("event_time_precision_invalid");
  if (!validTimestamp(manifest?.retrievedAt)) errors.push("retrieved_at_invalid");
  if (!Number.isSafeInteger(manifest?.rowCount) || manifest.rowCount < 0) errors.push("row_count_invalid");
  if (!Number.isSafeInteger(manifest?.labeledRowCount) || manifest.labeledRowCount < 0 ||
      manifest.labeledRowCount > (Number.isSafeInteger(manifest?.rowCount) ? manifest.rowCount : 0)) errors.push("labeled_row_count_invalid");
  if (!validSha256(manifest?.contentSha256)) errors.push("content_sha256_invalid");
  return errors;
}

/** Training permission is separate from source discoverability or import permission. */
export function evaluateWinMLDatasetReadiness(manifest: WinMLDatasetManifestV1) {
  const reasons = validateWinMLDatasetManifest(manifest);
  if (manifest?.approvedForTraining !== true) reasons.push("owner_training_approval_missing");
  if (manifest?.permittedUse !== "training") reasons.push("licence_does_not_permit_training");
  if (manifest?.eventTimePrecision !== "instant") reasons.push("exact_event_time_required_for_point_in_time_training");
  if (manifest?.rowCount < 1 || manifest?.labeledRowCount < 1) reasons.push("dataset_has_no_labeled_rows");
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** Reject future-information leakage and labels without explicit settlement semantics. */
export function validateWinMLTrainingExample(manifest: WinMLDatasetManifestV1, example: WinMLTrainingExampleV1): string[] {
  const errors: string[] = [];
  if (!evaluateWinMLDatasetReadiness(manifest).eligible) errors.push("dataset_not_training_eligible");
  if (example?.datasetId !== manifest?.datasetId) errors.push("example_dataset_mismatch");
  if (!nonEmpty(example?.sourceRecordId) || !nonEmpty(example?.eventId)) errors.push("source_record_and_event_ids_required");
  if (!validTimestamp(example?.eventStart) || !validTimestamp(example?.predictionCutoff)) errors.push("event_and_cutoff_timestamps_required");
  else if (Date.parse(example.predictionCutoff) >= Date.parse(example.eventStart)) errors.push("prediction_cutoff_must_precede_event");
  if (!example?.features || typeof example.features !== "object" || Array.isArray(example.features) || Object.keys(example.features).length === 0) {
    errors.push("point_in_time_features_required");
  } else for (const [name, feature] of Object.entries(example.features)) {
    if (!nonEmpty(name) || !feature || typeof feature !== "object" || !("value" in feature) ||
        !validTimestamp(feature.availableAt) || !nonEmpty(feature.sourceId)) {
      errors.push("feature_provenance_invalid:" + name); continue;
    }
    if (validTimestamp(example.predictionCutoff) && Date.parse(feature.availableAt) > Date.parse(example.predictionCutoff)) errors.push("future_feature_leakage:" + name);
    if (typeof feature.value === "number" && !Number.isFinite(feature.value)) errors.push("feature_numeric_value_invalid:" + name);
    if (!["number", "string", "boolean"].includes(typeof feature.value) && feature.value !== null) errors.push("feature_value_type_invalid:" + name);
  }
  const market = example?.label?.market, outcome = example?.label?.outcome;
  const validOutcome = market === "1x2" ? ["HOME", "DRAW", "AWAY", "VOID"].includes(outcome) :
    market === "total_goals" ? ["OVER", "UNDER", "PUSH", "VOID"].includes(outcome) : false;
  if (!validOutcome || !nonEmpty(example?.label?.settlementRuleId) || !validTimestamp(example?.label?.settledAt)) errors.push("settlement_aware_label_invalid");
  else if (validTimestamp(example.eventStart) && Date.parse(example.label.settledAt) < Date.parse(example.eventStart)) errors.push("label_cannot_settle_before_event_start");
  return errors;
}
