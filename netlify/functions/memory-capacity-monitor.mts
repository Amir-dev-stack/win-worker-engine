import { getStore } from "@netlify/blobs";
import { collectMemoryCapacity } from "../lib/memory-capacity.mts";

const STORE_OPTIONS = { name: "win-engine", region: "eu-central-1", consistency: "strong" as const };

export default async () => {
  const blobs = getStore(STORE_OPTIONS);
  const capacity = await collectMemoryCapacity();
  const key = "library/meta/memory-capacity-latest";
  const previous: any = await blobs.get(key, { type: "json" });
  const history = {
    ...capacity,
    previousCheckedAt: previous?.checkedAt || null,
    previousUsageBytes: previous?.neon?.usedBytes ?? null,
    growthBytes: previous?.neon?.usedBytes != null && capacity.neon.usedBytes != null
      ? capacity.neon.usedBytes - previous.neon.usedBytes
      : null,
    alertChanged: previous?.overallStatus !== capacity.overallStatus
  };
  await blobs.setJSON(key, history);
  return Response.json({ ok: true, overallStatus: history.overallStatus, alertChanged: history.alertChanged });
};

export const config = { schedule: "40 3 * * *", background: true };
