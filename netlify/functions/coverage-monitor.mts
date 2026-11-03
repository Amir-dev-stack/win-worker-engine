import type { Config } from "@netlify/functions";
import { saveCoverageSnapshot } from "../lib/coverage.mts";

export default async (_req: Request) => {
  const snapshot = await saveCoverageSnapshot();
  return Response.json(snapshot);
};

// Runs independently of AI spending; this records what WIN actually has.
export const config: Config = { schedule: "0 */6 * * *" };
