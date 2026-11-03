import type { Config } from "@netlify/functions";
import { syncOpenFootballHistoricalData } from "../lib/openfootball-adapter.mts";
import { runOpenFootballBaselineLab } from "../lib/model-lab.mts";
export default async (_req: Request) => {
 const sync=await syncOpenFootballHistoricalData();
 const experiment=sync.matchesWithScores>0?await runOpenFootballBaselineLab():null;
 return Response.json({sync,experiment});
};
// Daily deterministic ingestion; no AI calls or paid API.
export const config: Config = { schedule: "17 3 * * *" };
