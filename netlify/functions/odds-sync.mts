import type { Config } from "@netlify/functions";
import { authorized } from "../lib/auth.mts";
import { get, put } from "../lib/store.mts";

type ProviderEvent = {
  id?: string; sport?: string; league?: string; home_team?: string; away_team?: string;
  commence_time?: string; last_seen?: string; bookmakers?: Array<{
    key?: string; last_update?: string; markets?: unknown[];
  }>;
};

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

  const apiKey = Netlify.env.get("ARBISCAN_API_KEY");
  const now = new Date().toISOString();
  if (!apiKey) {
    await put("odds-status", "current", {
      status: "needs_configuration", provider: "ArbiScan",
      lastAttemptAt: now, error: "ARBISCAN_API_KEY is not configured."
    });
    return new Response(null, { status: 202 });
  }

  await put("odds-status", "current", {
    status: "syncing", provider: "ArbiScan",
    lastAttemptAt: now, error: null
  });

  try {
    const url = new URL("https://api.arbiscan.pl/v1/odds");
    url.searchParams.set("bookmakers", "sts");
    url.searchParams.set("limit", "100");

    const response = await fetch(url, {
      headers: { "X-API-Key": apiKey, "accept": "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const statusCode = response.status;
      const message = statusCode === 401 || statusCode === 403
        ? "The odds provider rejected the API key or its permissions."
        : "The odds provider returned HTTP " + statusCode + ".";
      await put("odds-status", "current", {
        status: statusCode === 401 || statusCode === 403 ? "authentication_error" : "provider_error",
        provider: "ArbiScan", lastAttemptAt: now, error: message
      });
      return new Response(null, { status: 202 });
    }

    const payload = await response.json() as { events?: ProviderEvent[]; freshness?: unknown; quota?: unknown };
    const events = Array.isArray(payload.events) ? payload.events : [];
    const currentMs = Date.now();
    let providerEventCount = 0;
    let staleEventCount = 0;

    const filtered = events.map(event => {
      const stsBooks = (event.bookmakers ?? []).filter(book => String(book.key ?? "").toLowerCase() === "sts");
      const freshBooks = stsBooks.filter(book => {
        const updateMs = book.last_update ? Date.parse(book.last_update) : NaN;
        if (!Number.isFinite(updateMs) || currentMs - updateMs > 15 * 60 * 1000 || updateMs > currentMs + 60 * 1000) return false;
        return true;
      });
      if (stsBooks.length) providerEventCount++;
      if (stsBooks.length && !freshBooks.length) staleEventCount++;
      return { ...event, bookmakers: freshBooks };
    }).filter(event => (event.bookmakers ?? []).length > 0);

    const snapshot = {
      provider: "ArbiScan",
      sourceLabel: "Independent STS odds feed; not an official STS API",
      capturedAt: new Date().toISOString(),
      freshnessLimitSeconds: 900,
      count: filtered.length,
      providerEventCount,
      staleEventCount,
      events: filtered,
      freshness: payload.freshness ?? null,
      quota: payload.quota ?? null
    };
    await put("odds", "latest", snapshot);
    await put("odds-status", "current", {
      status: filtered.length ? "connected" : "connected_no_fresh_events",
      provider: "ArbiScan", lastAttemptAt: now, lastSuccessAt: snapshot.capturedAt,
      count: filtered.length, staleEventCount, error: null
    });
  } catch (error) {
    await put("odds-status", "current", {
      status: "provider_error", provider: "ArbiScan",
      lastAttemptAt: now, error: String(error).slice(0, 300)
    });
  }
  return new Response(null, { status: 202 });
};

export const config: Config = { path: "/api/odds/sync", background: true };
