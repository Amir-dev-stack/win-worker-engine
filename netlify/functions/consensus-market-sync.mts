import type { Config } from "@netlify/functions";
import { syncConsensusMarketDatasets } from "../lib/consensus-market-adapter.mts";
import { runMarketCalibrationLab } from "../lib/market-calibration.mts";
export default async (_req: Request) => {
 const sync=await syncConsensusMarketDatasets();
 const calibration=await runMarketCalibrationLab();
 return Response.json({sync,calibration});
};
// Daily public CC BY 4.0 consensus-line sync; no API key or paid AI usage.
export const config: Config = { schedule: "17 5 * * *" };
