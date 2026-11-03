import type { Config } from "@netlify/functions";
import { discoverPublicResearchSources } from "../lib/public-source-discovery.mts";
export default async (_req: Request) => Response.json(await discoverPublicResearchSources());
// Daily metadata-only public index discovery; no content download, no adapter activation, no AI.
export const config: Config = { schedule: "17 2 * * *" };
