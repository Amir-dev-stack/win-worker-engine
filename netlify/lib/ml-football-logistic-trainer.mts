import { createHash } from "node:crypto";
import { canonicalizeWinMLProvenance } from "./ml-provenance.mts";
import type { WinMLModelEvaluationV1 } from "./ml-model-contract.mts";

export const WIN_ML_FOOTBALL_LOGISTIC_ARTIFACT_VERSION = "win.ml.football.logistic.artifact.v1" as const;
export const WIN_ML_FOOTBALL_1X2_CLASSES = ["HOME", "DRAW", "AWAY"] as const;
export type WinMLFootballOutcome = typeof WIN_ML_FOOTBALL_1X2_CLASSES[number];

export type WinMLFootballNumericRow = {
  eventId: string;
  eventStart: string;
  predictionCutoff: string;
  labelAvailableAt: string;
  features: Record<string, { value: number; availableAt: string; sourceId: string }>;
  outcome: WinMLFootballOutcome;
};

export type WinMLFootballLogisticConfig = {
  learningRate: number;
  epochs: number;
  l2: number;
};

export type WinMLFootballLogisticArtifactV1 = {
  artifactVersion: typeof WIN_ML_FOOTBALL_LOGISTIC_ARTIFACT_VERSION;
  modelId: string;
  datasetId: string;
  datasetContentSha256: string;
  featureSchemaVersion: string;
  featureNames: string[];
  classes: typeof WIN_ML_FOOTBALL_1X2_CLASSES;
  normalization: { means: number[]; scales: number[] };
  weights: number[][];
  baselineProbabilities: number[];
  trainingRows: number;
  validationRows: number;
  trainingWindow: { from: string; to: string };
  validationWindow: { from: string; to: string };
  fitDataCutoff: string;
  trainingConfig: WinMLFootballLogisticConfig;
  trainingConfigSha256: string;
  splitManifest: {
    trainingEventIds: string[];
    validationEventIds: string[];
  };
  splitManifestSha256: string;
  artifactSha256: string;
};

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , , offsetHour, offsetMinute] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const calendar = new Date(Date.UTC(y, m - 1, d));
  if (calendar.getUTCFullYear() !== y || calendar.getUTCMonth() !== m - 1 || calendar.getUTCDate() !== d ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
      (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateRows(rows: WinMLFootballNumericRow[], featureNames: string[], seen: Set<string>): string[] {
  const errors: string[] = [];
  for (const row of rows) {
    if (!row || typeof row.eventId !== "string" || !row.eventId.trim() || seen.has(row.eventId)) {
      errors.push("training_event_identity_missing_or_duplicate");
      continue;
    }
    seen.add(row.eventId);
    const eventStart = timestamp(row.eventStart);
    const predictionCutoff = timestamp(row.predictionCutoff);
    const labelAvailableAt = timestamp(row.labelAvailableAt);
    if (eventStart === null || predictionCutoff === null || predictionCutoff >= eventStart) {
      errors.push("training_prediction_cutoff_invalid:" + row.eventId);
    }
    if (eventStart === null || labelAvailableAt === null || labelAvailableAt < eventStart) {
      errors.push("training_label_availability_invalid:" + row.eventId);
    }
    if (!WIN_ML_FOOTBALL_1X2_CLASSES.includes(row.outcome)) errors.push("training_outcome_invalid:" + row.eventId);
    if (!row.features || typeof row.features !== "object" || Array.isArray(row.features)) {
      errors.push("training_features_invalid:" + row.eventId);
      continue;
    }
    const keys = Object.keys(row.features).sort();
    if (keys.length !== featureNames.length || keys.some((key, index) => key !== featureNames[index])) {
      errors.push("training_feature_schema_mismatch:" + row.eventId);
      continue;
    }
    for (const key of featureNames) {
      const feature = row.features[key];
      const availableAt = timestamp(feature?.availableAt);
      if (!feature || typeof feature !== "object" ||
          typeof feature.value !== "number" || !Number.isFinite(feature.value) ||
          availableAt === null || predictionCutoff === null || availableAt > predictionCutoff ||
          typeof feature.sourceId !== "string" || !feature.sourceId.trim()) {
        errors.push("training_feature_provenance_invalid:" + row.eventId + ":" + key);
      }
    }
  }
  return errors;
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map(value => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map(value => value / total);
}

function probabilities(weights: number[][], normalized: number[]): number[] {
  return softmax(weights.map(row => row[0] + row.slice(1).reduce((sum, weight, index) => sum + weight * normalized[index], 0)));
}

function metrics(rows: WinMLFootballNumericRow[], predict: (row: WinMLFootballNumericRow) => number[]) {
  let brier = 0, logLoss = 0, ece = 0;
  const bins = Array.from({ length: 10 }, () => ({ count: 0, confidence: 0, correct: 0 }));
  for (const row of rows) {
    const probs = predict(row);
    const actual = WIN_ML_FOOTBALL_1X2_CLASSES.indexOf(row.outcome);
    brier += probs.reduce((sum, probability, index) => sum + (probability - (index === actual ? 1 : 0)) ** 2, 0);
    logLoss -= Math.log(Math.max(1e-15, probs[actual]));
    const predicted = probs.indexOf(Math.max(...probs));
    const confidence = probs[predicted];
    const bin = bins[Math.min(9, Math.floor(confidence * 10))];
    bin.count++;
    bin.confidence += confidence;
    bin.correct += predicted === actual ? 1 : 0;
  }
  for (const bin of bins) if (bin.count) {
    ece += bin.count / rows.length * Math.abs(bin.correct / bin.count - bin.confidence / bin.count);
  }
  return { brier: brier / rows.length, logLoss: logLoss / rows.length, expectedCalibrationError: ece };
}

/**
 * Deterministic, dependency-free multinomial logistic regression.
 * Fits only the supplied training partition; validation is reporting-only.
 * This pure module has no store, network, provider, scheduler, or production route.
 * A separate held-out test evaluation and owner-controlled execution gate are mandatory.
 */
export function trainWinMLFootball1X2LogisticModel(args: {
  modelId: string;
  datasetId: string;
  datasetContentSha256: string;
  featureSchemaVersion: string;
  trainingRows: WinMLFootballNumericRow[];
  validationRows: WinMLFootballNumericRow[];
  config: WinMLFootballLogisticConfig;
}) {
  const errors: string[] = [];
  if (typeof args?.modelId !== "string" || !args.modelId.trim()) errors.push("model_id_required");
  if (typeof args?.datasetId !== "string" || !args.datasetId.trim()) errors.push("dataset_id_required");
  if (!/^[a-f0-9]{64}$/i.test(args?.datasetContentSha256 || "")) errors.push("dataset_content_hash_invalid");
  if (typeof args?.featureSchemaVersion !== "string" || !args.featureSchemaVersion.trim()) errors.push("feature_schema_version_required");
  if (!Array.isArray(args?.trainingRows) || args.trainingRows.length < 3 || args.trainingRows.length > 50_000) {
    errors.push("training_rows_out_of_bounds");
  }
  if (!Array.isArray(args?.validationRows) || args.validationRows.length < 1 || args.validationRows.length > 10_000) {
    errors.push("validation_rows_out_of_bounds");
  }
  const config = args?.config;
  if (!config || !Number.isFinite(config.learningRate) || config.learningRate <= 0 || config.learningRate > 1 ||
      !Number.isSafeInteger(config.epochs) || config.epochs < 1 || config.epochs > 5_000 ||
      !Number.isFinite(config.l2) || config.l2 < 0 || config.l2 > 10) {
    errors.push("training_config_invalid");
  }
  if (errors.length) throw new Error(errors.join(","));
  if (!config) throw new Error("training_config_invalid");

  const trainingRows = args.trainingRows;
  const validationRows = args.validationRows;
  const featureNames = Object.keys(trainingRows[0].features || {}).sort();
  if (featureNames.length === 0 || featureNames.length > 128 || featureNames.some(name => !name.trim())) {
    throw new Error("training_feature_count_out_of_bounds");
  }
  if (trainingRows.length * featureNames.length * config.epochs > 25_000_000 ||
      validationRows.length * featureNames.length > 5_000_000) {
    throw new Error("training_compute_budget_exceeded");
  }
  const seen = new Set<string>();
  errors.push(...validateRows(trainingRows, featureNames, seen));
  errors.push(...validateRows(validationRows, featureNames, seen));
  if (errors.length) throw new Error([...new Set(errors)].join(","));

  const trainingSorted = [...trainingRows].sort((a, b) => Date.parse(a.eventStart) - Date.parse(b.eventStart));
  const validationSorted = [...validationRows].sort((a, b) => Date.parse(a.eventStart) - Date.parse(b.eventStart));
  const trainingAvailabilitySorted = [...trainingRows].sort((a, b) =>
    Date.parse(a.labelAvailableAt) - Date.parse(b.labelAvailableAt));
  const validationStart = Date.parse(validationSorted[0].eventStart);
  const trainingAvailabilityEndAt = trainingAvailabilitySorted[trainingAvailabilitySorted.length - 1].labelAvailableAt;
  const trainingAvailabilityEnd = Date.parse(trainingAvailabilityEndAt);
  if (trainingAvailabilityEnd >= validationStart) throw new Error("training_validation_chronology_invalid");

  const means = featureNames.map(name =>
    trainingRows.reduce((sum, row) => sum + row.features[name].value, 0) / trainingRows.length
  );
  const scales = featureNames.map((name, index) => {
    const variance = trainingRows.reduce((sum, row) => sum + (row.features[name].value - means[index]) ** 2, 0) / trainingRows.length;
    const scale = Math.sqrt(variance);
    return scale > 1e-12 ? scale : 1;
  });
  const normalize = (row: WinMLFootballNumericRow) =>
    featureNames.map((name, index) => (row.features[name].value - means[index]) / scales[index]);

  const weights = WIN_ML_FOOTBALL_1X2_CLASSES.map(() => Array(featureNames.length + 1).fill(0) as number[]);
  const classIndex = (outcome: WinMLFootballOutcome) => WIN_ML_FOOTBALL_1X2_CLASSES.indexOf(outcome);
  for (let epoch = 0; epoch < config.epochs; epoch++) {
    const gradients = weights.map(() => Array(featureNames.length + 1).fill(0) as number[]);
    for (const row of trainingRows) {
      const x = normalize(row);
      const probs = probabilities(weights, x);
      const actual = classIndex(row.outcome);
      for (let klass = 0; klass < weights.length; klass++) {
        const error = probs[klass] - (klass === actual ? 1 : 0);
        gradients[klass][0] += error;
        for (let feature = 0; feature < x.length; feature++) {
          gradients[klass][feature + 1] += error * x[feature];
        }
      }
    }
    for (let klass = 0; klass < weights.length; klass++) {
      for (let feature = 0; feature < weights[klass].length; feature++) {
        const gradient = gradients[klass][feature] / trainingRows.length +
          (feature === 0 ? 0 : config.l2 * weights[klass][feature]);
        weights[klass][feature] -= config.learningRate * gradient;
        if (!Number.isFinite(weights[klass][feature])) throw new Error("training_numeric_divergence");
      }
    }
  }

  const predict = (row: WinMLFootballNumericRow) => probabilities(weights, normalize(row));
  const validationMetrics = metrics(validationRows, predict);
  const classCounts = WIN_ML_FOOTBALL_1X2_CLASSES.map(outcome =>
    trainingRows.filter(row => row.outcome === outcome).length / trainingRows.length
  );
  const baselineMetrics = metrics(validationRows, () => classCounts);
  const validationAvailabilitySorted = [...validationRows].sort((a, b) =>
    Date.parse(a.labelAvailableAt) - Date.parse(b.labelAvailableAt));
  const trainingWindow = {
    from: trainingSorted[0].eventStart,
    to: trainingAvailabilityEndAt
  };
  const validationWindow = {
    from: validationSorted[0].eventStart,
    to: validationAvailabilitySorted[validationAvailabilitySorted.length - 1].labelAvailableAt
  };
  const fitDataCutoff = trainingAvailabilityEndAt;
  const trainingConfigSha256 = sha256(canonicalizeWinMLProvenance(config));
  const splitManifest = {
    trainingEventIds: trainingSorted.map(row => row.eventId),
    validationEventIds: validationSorted.map(row => row.eventId)
  };
  const splitManifestSha256 = sha256(canonicalizeWinMLProvenance({
    ...splitManifest, trainingWindow, validationWindow, fitDataCutoff
  }));
  const artifactPayload = {
    artifactVersion: WIN_ML_FOOTBALL_LOGISTIC_ARTIFACT_VERSION,
    modelId: args.modelId,
    datasetId: args.datasetId,
    datasetContentSha256: args.datasetContentSha256,
    featureSchemaVersion: args.featureSchemaVersion,
    featureNames,
    classes: WIN_ML_FOOTBALL_1X2_CLASSES,
    normalization: { means, scales },
    weights,
    baselineProbabilities: classCounts,
    trainingRows: trainingRows.length,
    validationRows: validationRows.length,
    trainingWindow,
    validationWindow,
    fitDataCutoff,
    trainingConfig: { ...config },
    trainingConfigSha256,
    splitManifest,
    splitManifestSha256
  };
  const artifact: WinMLFootballLogisticArtifactV1 = {
    ...artifactPayload,
    artifactSha256: sha256(canonicalizeWinMLProvenance(artifactPayload))
  };
  return {
    artifact,
    validationMetrics,
    baselineMetrics,
    validationRows: validationRows.length,
    heldOutTestRequired: true as const,
    productionPromotionAllowed: false as const,
    automatedBettingAllowed: false as const
  };
}

/** Produces a normalized three-class vector from a frozen logistic artifact. */
export function predictWinMLFootball1X2(
  artifact: WinMLFootballLogisticArtifactV1,
  features: Record<string, number>
) {
  if (!artifact || artifact.artifactVersion !== WIN_ML_FOOTBALL_LOGISTIC_ARTIFACT_VERSION ||
      !Array.isArray(artifact.featureNames) || !Array.isArray(artifact.weights) ||
      artifact.weights.length !== WIN_ML_FOOTBALL_1X2_CLASSES.length ||
      !Array.isArray(artifact.classes) || artifact.classes.length !== WIN_ML_FOOTBALL_1X2_CLASSES.length ||
      artifact.classes.some((value, index) => value !== WIN_ML_FOOTBALL_1X2_CLASSES[index]) ||
      !Array.isArray(artifact.baselineProbabilities) ||
      artifact.baselineProbabilities.length !== WIN_ML_FOOTBALL_1X2_CLASSES.length ||
      artifact.baselineProbabilities.some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) ||
      Math.abs(artifact.baselineProbabilities.reduce((sum, value) => sum + value, 0) - 1) > 1e-9 ||
      artifact.featureNames.length < 1 || artifact.featureNames.length > 128 ||
      typeof artifact.modelId !== "string" || !artifact.modelId.trim() ||
      typeof artifact.datasetId !== "string" || !artifact.datasetId.trim() ||
      !/^[a-f0-9]{64}$/i.test(artifact.datasetContentSha256 || "") ||
      !Number.isSafeInteger(artifact.trainingRows) || artifact.trainingRows < 3 ||
      !Number.isSafeInteger(artifact.validationRows) || artifact.validationRows < 1 ||
      !artifact.trainingConfig || !Number.isFinite(artifact.trainingConfig.learningRate) ||
      artifact.trainingConfig.learningRate <= 0 || artifact.trainingConfig.learningRate > 1 ||
      !Number.isSafeInteger(artifact.trainingConfig.epochs) || artifact.trainingConfig.epochs < 1 ||
      artifact.trainingConfig.epochs > 5_000 || !Number.isFinite(artifact.trainingConfig.l2) ||
      artifact.trainingConfig.l2 < 0 || artifact.trainingConfig.l2 > 10 ||
      !/^[a-f0-9]{64}$/i.test(artifact.trainingConfigSha256 || "") ||
      !/^[a-f0-9]{64}$/i.test(artifact.splitManifestSha256 || "") ||
      !artifact.splitManifest || !Array.isArray(artifact.splitManifest.trainingEventIds) ||
      !Array.isArray(artifact.splitManifest.validationEventIds) ||
      artifact.splitManifest.trainingEventIds.some(id => typeof id !== "string" || !id.trim()) ||
      artifact.splitManifest.validationEventIds.some(id => typeof id !== "string" || !id.trim()) ||
      artifact.splitManifest.trainingEventIds.length !== artifact.trainingRows ||
      artifact.splitManifest.validationEventIds.length !== artifact.validationRows ||
      new Set([...artifact.splitManifest.trainingEventIds, ...artifact.splitManifest.validationEventIds]).size !==
        artifact.splitManifest.trainingEventIds.length + artifact.splitManifest.validationEventIds.length ||
      !Array.isArray(artifact.normalization?.means) ||
      !Array.isArray(artifact.normalization?.scales) ||
      artifact.normalization.means.length !== artifact.featureNames.length ||
      artifact.normalization.scales.length !== artifact.featureNames.length ||
      artifact.weights.some(row => !Array.isArray(row) || row.length !== artifact.featureNames.length + 1 ||
        row.some(value => typeof value !== "number" || !Number.isFinite(value))) ||
      artifact.normalization.means.some(value => typeof value !== "number" || !Number.isFinite(value)) ||
      artifact.normalization.scales.some(value => typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
    throw new Error("model_artifact_invalid");
  }
  const trainingFrom = timestamp(artifact.trainingWindow?.from);
  const trainingTo = timestamp(artifact.trainingWindow?.to);
  const validationFrom = timestamp(artifact.validationWindow?.from);
  const validationTo = timestamp(artifact.validationWindow?.to);
  const fitCutoff = timestamp(artifact.fitDataCutoff);
  if (trainingFrom === null || trainingTo === null || validationFrom === null ||
      validationTo === null || fitCutoff === null || trainingFrom > trainingTo ||
      trainingTo !== fitCutoff || trainingTo >= validationFrom || validationFrom > validationTo) {
    throw new Error("model_artifact_chronology_invalid");
  }
  if (sha256(canonicalizeWinMLProvenance(artifact.trainingConfig)) !== artifact.trainingConfigSha256) {
    throw new Error("model_artifact_training_config_hash_mismatch");
  }
  const splitPayload = {
    ...artifact.splitManifest,
    trainingWindow: artifact.trainingWindow,
    validationWindow: artifact.validationWindow,
    fitDataCutoff: artifact.fitDataCutoff
  };
  if (sha256(canonicalizeWinMLProvenance(splitPayload)) !== artifact.splitManifestSha256) {
    throw new Error("model_artifact_split_manifest_hash_mismatch");
  }
  const { artifactSha256, ...artifactPayload } = artifact;
  if (!/^[a-f0-9]{64}$/i.test(artifactSha256 || "") ||
      sha256(canonicalizeWinMLProvenance(artifactPayload)) !== artifactSha256) {
    throw new Error("model_artifact_hash_mismatch");
  }
  const sortedFeatureNames = [...artifact.featureNames].sort();
  if (artifact.featureNames.some((name, index) => typeof name !== "string" || !name.trim() ||
      name !== sortedFeatureNames[index]) || new Set(artifact.featureNames).size !== artifact.featureNames.length) {
    throw new Error("model_artifact_feature_schema_invalid");
  }
  const keys = Object.keys(features || {}).sort();
  if (keys.length !== artifact.featureNames.length || keys.some((key, index) => key !== artifact.featureNames[index])) {
    throw new Error("prediction_feature_schema_mismatch");
  }
  const normalized = artifact.featureNames.map((name, index) => {
    const value = features[name];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("prediction_feature_invalid:" + name);
    return (value - artifact.normalization.means[index]) / artifact.normalization.scales[index];
  });
  return {
    modelId: artifact.modelId,
    probabilities: probabilities(artifact.weights, normalized),
    usage: "shadow_only" as const,
    productionUseAllowed: false as const,
    automatedBettingAllowed: false as const
  };
}

/** Evaluates a frozen artifact on a later, non-overlapping test partition. */
export function evaluateWinMLFootball1X2LogisticModel(
  artifact: WinMLFootballLogisticArtifactV1,
  testRows: WinMLFootballNumericRow[],
  evaluatedAt: string
) {
  if (!artifact || !Array.isArray(artifact.featureNames) || !Array.isArray(testRows) ||
      testRows.length < 1 || testRows.length > 10_000) {
    throw new Error("held_out_test_rows_out_of_bounds");
  }
  const emptyFeatures = Object.fromEntries(artifact.featureNames.map(name => [name, 0]));
  predictWinMLFootball1X2(artifact, emptyFeatures);
  const seen = new Set([
    ...artifact.splitManifest.trainingEventIds,
    ...artifact.splitManifest.validationEventIds
  ]);
  const evaluatedAtMs = timestamp(evaluatedAt);
  if (evaluatedAtMs === null) throw new Error("held_out_test_evaluation_timestamp_invalid");
  const errors = validateRows(testRows, artifact.featureNames, seen);
  if (errors.length) throw new Error([...new Set(errors)].join(","));
  if (testRows.some(row => Date.parse(row.labelAvailableAt) > evaluatedAtMs)) {
    throw new Error("held_out_test_labels_not_available_as_of_evaluation");
  }
  const sorted = [...testRows].sort((a, b) => Date.parse(a.eventStart) - Date.parse(b.eventStart));
  const validationEnd = timestamp(artifact.validationWindow.to);
  const testStart = timestamp(sorted[0].eventStart);
  if (validationEnd === null || testStart === null || testStart <= validationEnd) {
    throw new Error("held_out_test_not_after_validation_label_availability");
  }
  const modelMetrics = metrics(testRows, row => {
    const normalized = artifact.featureNames.map((name, index) =>
      (row.features[name].value - artifact.normalization.means[index]) / artifact.normalization.scales[index]
    );
    return probabilities(artifact.weights, normalized);
  });
  const baselineMetrics = metrics(testRows, () => artifact.baselineProbabilities);
  return {
    evaluatedAt,
    artifactSha256: artifact.artifactSha256,
    testRows: testRows.length,
    testWindow: {
      from: sorted[0].eventStart,
      to: [...testRows].sort((a, b) => Date.parse(b.labelAvailableAt) - Date.parse(a.labelAvailableAt))[0].labelAvailableAt
    },
    modelMetrics,
    baselineMetrics,
    heldOutTest: true as const,
    promotionAllowed: false as const,
    productionPromotionAllowed: false as const,
    automatedBettingAllowed: false as const
  };
}

/**
 * Creates the existing versioned evaluation contract from a frozen artifact
 * and its later held-out test report. This does not approve the dataset or
 * promote the model; the normal owner/licence gate still applies.
 */
export function buildWinMLFootball1X2EvaluationRecord(
  artifact: WinMLFootballLogisticArtifactV1,
  testEvaluation: ReturnType<typeof evaluateWinMLFootball1X2LogisticModel>,
  metadata: {
    modelVersion: string;
    trainingRunId: string;
    featureBuilderCommitSha: string;
    sourceCommitSha: string;
    trainedAt: string;
  }
): WinMLModelEvaluationV1 {
  if (!artifact || !testEvaluation || testEvaluation.heldOutTest !== true ||
      testEvaluation.artifactSha256 !== artifact.artifactSha256) {
    throw new Error("model_evaluation_artifact_binding_invalid");
  }
  predictWinMLFootball1X2(artifact,
    Object.fromEntries(artifact.featureNames.map(name => [name, 0]))
  );
  if (!metadata || typeof metadata.modelVersion !== "string" || !metadata.modelVersion.trim() ||
      typeof metadata.trainingRunId !== "string" || !metadata.trainingRunId.trim() ||
      !/^[a-f0-9]{40}$/i.test(metadata.featureBuilderCommitSha || "") ||
      !/^[a-f0-9]{40}$/i.test(metadata.sourceCommitSha || "")) {
    throw new Error("model_evaluation_provenance_metadata_invalid");
  }
  const trainedAt = timestamp(metadata.trainedAt);
  const fitDataCutoff = timestamp(artifact.fitDataCutoff);
  const validationStart = timestamp(artifact.validationWindow.from);
  const validationEnd = timestamp(artifact.validationWindow.to);
  const testStart = timestamp(testEvaluation.testWindow.from);
  const testEnd = timestamp(testEvaluation.testWindow.to);
  const evaluatedAt = timestamp(testEvaluation.evaluatedAt);
  if (trainedAt === null || fitDataCutoff === null || validationStart === null ||
      validationEnd === null || testStart === null || testEnd === null || evaluatedAt === null ||
      trainedAt < fitDataCutoff ||
      testStart <= validationEnd || evaluatedAt < testEnd) {
    throw new Error("model_evaluation_chronology_invalid");
  }
  return {
    evaluationVersion: "win.ml.model.evaluation.v1",
    modelId: artifact.modelId,
    modelVersion: metadata.modelVersion,
    sport: "association_football",
    market: "1x2",
    algorithm: "logistic_regression",
    datasetId: artifact.datasetId,
    datasetContentSha256: artifact.datasetContentSha256,
    featureSchemaVersion: artifact.featureSchemaVersion,
    featureNames: [...artifact.featureNames],
    featureBuilderCommitSha: metadata.featureBuilderCommitSha,
    trainingConfigSha256: artifact.trainingConfigSha256,
    splitManifestSha256: artifact.splitManifestSha256,
    trainingRunId: metadata.trainingRunId,
    targetDefinition: "regulation_time_1x2_settlement",
    trainingWindow: { ...artifact.trainingWindow },
    validationWindow: { ...artifact.validationWindow },
    testWindow: { ...testEvaluation.testWindow },
    trainedAt: metadata.trainedAt,
    fitDataCutoff: artifact.fitDataCutoff,
    trainingRows: artifact.trainingRows,
    validationRows: artifact.validationRows,
    testRows: testEvaluation.testRows,
    baselineMetrics: {
      brier: testEvaluation.baselineMetrics.brier,
      logLoss: testEvaluation.baselineMetrics.logLoss
    },
    modelMetrics: {
      brier: testEvaluation.modelMetrics.brier,
      logLoss: testEvaluation.modelMetrics.logLoss
    },
    expectedCalibrationError: testEvaluation.modelMetrics.expectedCalibrationError,
    artifactSha256: artifact.artifactSha256,
    sourceCommitSha: metadata.sourceCommitSha
  };
}