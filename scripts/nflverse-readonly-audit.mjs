import { auditNflversePlayByPlayReadOnly } from "../netlify/lib/nflverse-pbp-adapter.mts";

const requestedSeason = process.env.NFLVERSE_AUDIT_SEASON
  ? Number(process.env.NFLVERSE_AUDIT_SEASON)
  : undefined;

if (requestedSeason !== undefined &&
    (!Number.isInteger(requestedSeason) || requestedSeason < 1999 || requestedSeason > new Date().getUTCFullYear())) {
  throw new Error("NFLVERSE_AUDIT_SEASON must be a valid season year.");
}

const result = await auditNflversePlayByPlayReadOnly(requestedSeason);
console.log(JSON.stringify(result, null, 2));

if (result.writesPerformed !== 0 || result.aiCalls !== 0) {
  throw new Error("Read-only audit safety invariant violated.");
}
if (!result.completedMatches || !result.rowAudit.rowsSeen) {
  throw new Error("Read-only audit did not return usable play-by-play rows and completed matches.");
}
if (result.payloadMetrics.recordCount !== result.completedMatches) {
  throw new Error("Payload measurement count does not match completed match count.");
}
