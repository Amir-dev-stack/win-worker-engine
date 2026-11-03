import type { Config } from "@netlify/functions";
import { syncConsensusMarketDatasets } from "../lib/consensus-market-adapter.mts";
export default async (_req: Request) => Response.json(await syncConsensusMarketDatasets());
// Daily public CC BY 4.0 consensus-line sync; no API key or paid AI usage.
export const config: Config = { schedule: "17 5 * * *" };
