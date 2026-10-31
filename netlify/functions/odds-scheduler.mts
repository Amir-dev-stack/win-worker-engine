import type { Config } from "@netlify/functions";
import { put } from "../lib/store.mts";

const SITE_URL = "https://win-worker-engine.netlify.app";

export default async () => {
  const now = new Date().toISOString();
  const apiKey = Netlify.env.get("ARBISCAN_API_KEY");
  const internalToken = Netlify.env.get("WIN_INTERNAL_TOKEN");

  if (!apiKey) {
    await put("odds-status", "current", {
      status: "needs_configuration", provider: "ArbiScan",
      lastAttemptAt: now, error: "Add ARBISCAN_API_KEY in Netlify after activating a licensed feed."
    });
    return;
  }
  if (!internalToken) {
    await put("odds-status", "current", {
      status: "configuration_error", provider: "ArbiScan",
      lastAttemptAt: now, error: "WIN_INTERNAL_TOKEN is missing from the function environment."
    });
    return;
  }

  const response = await fetch(SITE_URL + "/api/odds/sync", {
    method: "POST",
    headers: { "authorization": "Bearer " + internalToken, "content-type": "application/json" },
    body: JSON.stringify({ source: "scheduled", triggeredAt: now }),
    signal: AbortSignal.timeout(10000)
  });
  if (response.status !== 202 && !response.ok) {
    await put("odds-status", "current", {
      status: "scheduler_error", provider: "ArbiScan", lastAttemptAt: now,
      error: "Could not queue the odds synchronization job (HTTP " + response.status + ")."
    });
  }
};

export const config: Config = { schedule: "*/15 * * * *" };
