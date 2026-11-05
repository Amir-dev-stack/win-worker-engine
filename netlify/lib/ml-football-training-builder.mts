import {
  evaluateWinMLDatasetReadiness,
  validateWinMLTrainingExample,
  type WinMLDatasetManifestV1,
  type WinMLTrainingExampleV1
} from "./ml-data-contract.mts";
import {
  buildWinFootballPointInTimeFeatures,
  type WinFootballResultWithAvailability
} from "./ml-football-features.mts";

export type WinFootballTrainingCandidate = {
  example: WinMLTrainingExampleV1;
  featureSchemaVersion: "win.football.form.v1";
  featureNames: string[];
  sourceEvidence: {
    historicalMatchesUsedHome: number;
    historicalMatchesUsedAway: number;
    excludedHistoricalRows: number;
  };
};

export type WinFootballTrainingBuildResult = {
  datasetId: string;
  market: "1x2";
  candidates: WinFootballTrainingCandidate[];
  rejected: Array<{ eventId: string; reasons: string[] }>;
  trainingReadiness: { eligible: boolean; reasons: string[] };
  readyForTraining: false | true;
};

/**
 * Converts finished target matches into auditable 1X2 examples. Each target
 * requires an explicit event-specific prediction cutoff. Candidate creation
 * is allowed for research, but the dataset readiness gate remains authoritative
 * and prevents research-only data from being used for model fitting.
 */
export function buildWinFootball1X2TrainingCandidates(args: {
  manifest: WinMLDatasetManifestV1;
  rows: WinFootballResultWithAvailability[];
  predictionCutoffsByEventId: Record<string, string>;
  /** Optional explicit target list; all rows remain available as historical evidence. */
  targetEventIds?: string[];
  settlementRuleId: string;
}): WinFootballTrainingBuildResult {
  if (!args?.manifest || !Array.isArray(args.rows) ||
      !args.predictionCutoffsByEventId || typeof args.predictionCutoffsByEventId !== "object" ||
      typeof args.settlementRuleId !== "string" || !args.settlementRuleId.trim()) {
    throw new Error("football_training_build_arguments_invalid");
  }
  if (args.targetEventIds !== undefined && (!Array.isArray(args.targetEventIds) ||
      args.targetEventIds.some(id => typeof id !== "string" || !id.trim()) ||
      new Set(args.targetEventIds).size !== args.targetEventIds.length)) {
    throw new Error("football_training_target_event_ids_invalid");
  }
  const seenEvents = new Set<string>();
  const seenSources = new Set<string>();
  for (const row of args.rows) {
    if (!row || typeof row.eventId !== "string" || !row.eventId.trim() ||
        typeof row.sourceRecordId !== "string" || !row.sourceRecordId.trim() ||
        seenEvents.has(row.eventId) || seenSources.has(row.sourceRecordId)) {
      throw new Error("football_training_input_identity_duplicate_or_invalid");
    }
    seenEvents.add(row.eventId);
    seenSources.add(row.sourceRecordId);
  }
  const targetIds = args.targetEventIds ? new Set(args.targetEventIds) : null;
  const targetRows = targetIds ? args.rows.filter(row => targetIds.has(row.eventId)) : args.rows;
  if (targetIds && targetRows.length !== targetIds.size) {
    throw new Error("football_training_target_event_not_found");
  }
  const readiness = evaluateWinMLDatasetReadiness(args.manifest);
  const candidates: WinFootballTrainingCandidate[] = [];
  const rejected: WinFootballTrainingBuildResult["rejected"] = [];

  for (const target of targetRows) {
    if (!target || !target.eventId) {
      rejected.push({ eventId: "unknown", reasons: ["target_identity_invalid"] });
      continue;
    }
    const cutoff = args.predictionCutoffsByEventId[target.eventId];
    if (!cutoff) {
      rejected.push({ eventId: target.eventId, reasons: ["prediction_cutoff_missing"] });
      continue;
    }
    if (!Number.isSafeInteger(target.homeGoals) || target.homeGoals < 0 ||
        !Number.isSafeInteger(target.awayGoals) || target.awayGoals < 0 ||
        !target.resultAvailableAt) {
      rejected.push({ eventId: target.eventId, reasons: ["finished_target_and_settlement_timestamp_required"] });
      continue;
    }

    let featureSet;
    try {
      featureSet = buildWinFootballPointInTimeFeatures({
        datasetId: args.manifest.datasetId,
        historicalRows: args.rows,
        target: {
          eventId: target.eventId,
          kickoff: target.kickoff,
          homeTeamId: target.homeTeamId,
          awayTeamId: target.awayTeamId
        },
        predictionCutoff: cutoff
      });
    } catch (error) {
      rejected.push({
        eventId: target.eventId,
        reasons: [error instanceof Error && "code" in error ? String(error.code) : "feature_build_failed"]
      });
      continue;
    }
    const featureEntries = Object.entries(featureSet.features);
    if (featureEntries.length === 0) {
      rejected.push({ eventId: target.eventId, reasons: ["no_point_in_time_features_available"] });
      continue;
    }
    const outcome = target.homeGoals > target.awayGoals ? "HOME" :
      target.homeGoals < target.awayGoals ? "AWAY" : "DRAW";
    const example: WinMLTrainingExampleV1 = {
      datasetId: args.manifest.datasetId,
      sourceRecordId: target.sourceRecordId,
      eventId: target.eventId,
      eventStart: target.kickoff,
      predictionCutoff: cutoff,
      features: featureSet.features,
      label: {
        market: "1x2",
        outcome,
        settlementRuleId: args.settlementRuleId,
        settledAt: target.resultAvailableAt
      }
    };
    const structuralErrors = validateWinMLTrainingExample(args.manifest, example)
      .filter(reason => reason !== "dataset_not_training_eligible");
    if (structuralErrors.length) {
      rejected.push({ eventId: target.eventId, reasons: structuralErrors });
      continue;
    }
    candidates.push({
      example,
      featureSchemaVersion: featureSet.featureSchemaVersion,
      featureNames: featureEntries.map(([name]) => name).sort(),
      sourceEvidence: {
        historicalMatchesUsedHome: featureSet.evidence.homeMatchesUsed,
        historicalMatchesUsedAway: featureSet.evidence.awayMatchesUsed,
        excludedHistoricalRows: featureSet.evidence.excludedFutureOrUnavailableRows
      }
    });
  }

  return {
    datasetId: args.manifest.datasetId,
    market: "1x2",
    candidates,
    rejected,
    trainingReadiness: readiness,
    readyForTraining: readiness.eligible && rejected.length === 0 && candidates.length > 0
  };
}
