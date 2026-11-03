import type { Config } from "@netlify/functions";
import { settleObservedWorldCupMarkets } from "../lib/observed-market-settlement.mts";
export default async (_req: Request) => Response.json(await settleObservedWorldCupMarkets());
// Join static bookmaker snapshots to exact public tournament settlements, then use the existing coupon simulator.
export const config: Config = { schedule: "17 7 * * *" };
