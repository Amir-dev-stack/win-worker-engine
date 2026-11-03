import type { Config } from "@netlify/functions";
import { syncSharpApiSampleMarkets } from "../lib/sharpapi-sample-adapter.mts";
export default async (_req: Request) => Response.json(await syncSharpApiSampleMarkets());
// Weekly refresh: this is a static public snapshot, not a live odds feed.
export const config: Config = { schedule: "37 6 * * 1" };
