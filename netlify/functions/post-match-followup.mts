import type { Config } from "@netlify/functions";
import { runPostMatchFollowups } from "../lib/post-match-followup.mts";
export default async (_req: Request) => Response.json(await runPostMatchFollowups());
// Deterministic public-score polling. No AI, no bet placement, bounded coupon batch.
export const config: Config = { schedule: "23 */4 * * *" };
