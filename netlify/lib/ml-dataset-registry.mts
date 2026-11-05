import {
  validateWinMLDatasetManifest,
  type WinMLDatasetManifestV1
} from "./ml-data-contract.mts";
import { get, list, putIfNew } from "./store.mts";

const DATASET_COLLECTION = "library/ml-dataset-manifests";
const MAX_INVENTORY_ITEMS = 500;

export class WinMLDatasetRegistryError extends Error {
  readonly code: string;
  readonly details: string[];
  constructor(code: string, details: string[] = []) {
    super(code);
    this.name = "WinMLDatasetRegistryError";
    this.code = code;
    this.details = details;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map(key =>
      JSON.stringify(key) + ":" + canonical(record[key])
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}

function validDatasetId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
}

/**
 * Registers immutable provenance metadata only. Registration does not imply
 * training approval, fetch source data, or execute an importer.
 */
export async function registerWinMLDatasetManifest(manifest: WinMLDatasetManifestV1) {
  const errors = validateWinMLDatasetManifest(manifest);
  if (errors.length) throw new WinMLDatasetRegistryError("dataset_manifest_invalid", errors);
  if (!validDatasetId(manifest.datasetId)) {
    throw new WinMLDatasetRegistryError("dataset_id_invalid");
  }

  const existing = await get<WinMLDatasetManifestV1>(DATASET_COLLECTION, manifest.datasetId);
  if (existing) {
    if (canonical(existing) === canonical(manifest)) {
      return { registered: false, idempotent: true, manifest: existing };
    }
    throw new WinMLDatasetRegistryError("dataset_manifest_immutable_conflict");
  }

  const result = await putIfNew(DATASET_COLLECTION, manifest.datasetId, manifest);
  if (result?.modified) return { registered: true, idempotent: false, manifest };

  // Another worker may have registered the same ID between our read and write.
  const raced = await get<WinMLDatasetManifestV1>(DATASET_COLLECTION, manifest.datasetId);
  if (raced && canonical(raced) === canonical(manifest)) {
    return { registered: false, idempotent: true, manifest: raced };
  }
  throw new WinMLDatasetRegistryError("dataset_manifest_immutable_conflict");
}

export async function getWinMLDatasetManifest(datasetId: string) {
  if (!validDatasetId(datasetId)) throw new WinMLDatasetRegistryError("dataset_id_invalid");
  return await get<WinMLDatasetManifestV1>(DATASET_COLLECTION, datasetId);
}

/** Bounded metadata inventory; it never downloads raw sports data. */
export async function listWinMLDatasetManifests(limit = 100) {
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(MAX_INVENTORY_ITEMS, Math.floor(limit)))
    : 100;
  const manifests = await list<WinMLDatasetManifestV1>(DATASET_COLLECTION, boundedLimit);
  return manifests
    .filter(manifest => manifest && manifest.manifestVersion === "win.ml.dataset.v1")
    .sort((a, b) => Date.parse(b.retrievedAt) - Date.parse(a.retrievedAt));
}
