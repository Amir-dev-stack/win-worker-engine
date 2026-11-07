import {
  importWinFootballResultsBytes,
  type WinFootballImportSource,
  type WinFootballResultRow
} from "./ml-football-importer.mts";
import { registerWinMLDatasetManifest } from "./ml-dataset-registry.mts";

/**
 * Validates caller-supplied bytes and registers only their research-only
 * provenance manifest. Raw bytes and normalized rows are returned to the
 * caller and are not persisted by this workflow.
 */
export async function ingestWinFootballResultsResearchSample(
  rawBytes: Uint8Array,
  source: WinFootballImportSource
): Promise<{
  manifest: Awaited<ReturnType<typeof registerWinMLDatasetManifest>>["manifest"];
  rows: WinFootballResultRow[];
  rawByteLength: number;
  registration: { registered: boolean; idempotent: boolean };
}> {
  const imported = importWinFootballResultsBytes(rawBytes, source);
  const registration = await registerWinMLDatasetManifest(imported.manifest);
  return {
    manifest: registration.manifest,
    rows: imported.rows,
    rawByteLength: imported.rawByteLength,
    registration: {
      registered: registration.registered,
      idempotent: registration.idempotent
    }
  };
}
