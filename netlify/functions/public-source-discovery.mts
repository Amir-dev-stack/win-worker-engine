import type { Config } from "@netlify/functions";
import { discoverPublicResearchSources } from "../lib/public-source-discovery.mts";
export default async (_req: Request) => Response.json(await discoverPublicResearchSources());
// Metadata-only discovery from public Hugging Face and GitHub APIs; no downloads, no AI, no source auto-activation.
export const config: Config = { schedule: "17 2 * * *" };
