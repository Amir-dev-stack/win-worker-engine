import type { Config } from "@netlify/functions";
import { syncOpenFootballWorldCupData } from "../lib/openfootball-worldcup-adapter.mts";
import { runOpenFootballBaselineLab } from "../lib/model-lab.mts";
export default async (_req: Request) => {
 const sync=await syncOpenFootballWorldCupData();
 const baseline=sync.matchesImported>0?await runOpenFootballBaselineLab():null;
 return Response.json({sync,baseline});
};
// Separate daily schedule from league sync to keep each ingestion job bounded.
export const config: Config = { schedule: "17 4 * * *" };
