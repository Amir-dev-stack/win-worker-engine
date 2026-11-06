import type { Config } from "@netlify/functions";
import { requireAuth } from "../lib/auth.mts";
import { getWithMetadata, put, putIfMatch, putIfNew } from "../lib/store.mts";
import { discoverPublicResearchSources } from "../lib/public-source-discovery.mts";
import { syncOpenFootballHistoricalData } from "../lib/openfootball-adapter.mts";
import { syncOpenFootballWorldCupData } from "../lib/openfootball-worldcup-adapter.mts";
import { syncConsensusMarketDatasets } from "../lib/consensus-market-adapter.mts";
import { syncSharpApiSampleMarkets } from "../lib/sharpapi-sample-adapter.mts";
import { runOpenFootballBaselineLab } from "../lib/model-lab.mts";
import { settleObservedWorldCupMarkets } from "../lib/observed-market-settlement.mts";
import { runMarketCalibrationLab } from "../lib/market-calibration.mts";
import { syncNflversePlayByPlayData } from "../lib/nflverse-pbp-adapter.mts";
import { syncStatsBombOpenDataResearch, STATSBOMB_RESEARCH_CONFIRMATION } from "../lib/statsbomb-open-data-adapter.mts";
import { syncSkillCornerBasketballAggregates, SKILLCORNER_RESEARCH_CONFIRMATION } from "../lib/skillcorner-basketball-adapter.mts";

type JobAction = "discover_sources" | "sync_historical_data" | "sync_statsbomb_open_data" | "sync_skillcorner_basketball";
const actions = new Set<JobAction>(["discover_sources", "sync_historical_data", "sync_statsbomb_open_data", "sync_skillcorner_basketball"]);

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Expected JSON body" }, { status: 400 }); }
  const action = String(body?.action || "") as JobAction;
  if (!actions.has(action)) return Response.json({ error: "Unsupported learning data job." }, { status: 400 });
  if (action === "sync_statsbomb_open_data" && body?.confirmResearchUse !== STATSBOMB_RESEARCH_CONFIRMATION) {
    return Response.json({ error: "StatsBomb import requires explicit confirmation for private non-commercial research use." }, { status: 400 });
  }
  if (action === "sync_skillcorner_basketball" && body?.confirmResearchUse !== SKILLCORNER_RESEARCH_CONFIRMATION) {
    return Response.json({ error: "SkillCorner import requires confirmation of source credit and the limited ACB 2025/26 player-season aggregate scope." }, { status: 400 });
  }

  const now = new Date();
  const startedAt = now.toISOString();
  const jobId = "learning-data-" + action + "-" + startedAt.replace(/[^0-9]/g, "");
  const lockKey = action;
  const prior = await getWithMetadata<any>("library/learning-data-job-locks", lockKey);
  if (prior?.value?.status === "running" && Date.parse(prior.value.leaseExpiresAt || "") > now.getTime()) {
    return Response.json({ accepted: false, status: "already_running", action }, { status: 409 });
  }
  const lock = {
    id: lockKey, jobId, action, status: "running", startedAt,
    leaseExpiresAt: new Date(now.getTime() + 17 * 60 * 1000).toISOString(),
    aiCalls: 0
  };
  const claim = prior
    ? await putIfMatch("library/learning-data-job-locks", lockKey, lock, prior.etag)
    : await putIfNew("library/learning-data-job-locks", lockKey, lock);
  if (!claim.modified || !claim.etag) {
    return Response.json({ accepted: false, status: "already_running", action }, { status: 409 });
  }
  const lockEtag = claim.etag;
  const stateKey = action === "discover_sources" ? "public-source-discovery" : action === "sync_statsbomb_open_data" ? "statsbomb-open-data" : action === "sync_skillcorner_basketball" ? "skillcorner-open-basketball-acb-2025-26" : "manual-historical-data-sync";
  await put("scheduler-state", stateKey, { status: "running", startedAt, jobId, action, aiCalls: 0 });

  try {
    let result: any;
    if (action === "discover_sources") {
      result = await discoverPublicResearchSources();
    } else if (action === "sync_statsbomb_open_data") {
      const imported = await syncStatsBombOpenDataResearch({
        competitionId: body?.competitionId,
        seasonId: body?.seasonId,
        maxMatches: body?.maxMatches,
        confirmResearchUse: body?.confirmResearchUse
      });
      result = {
        status: imported.status,
        startedAt,
        completedAt: new Date().toISOString(),
        steps: [{ name: "statsbomb_open_data_manual_research_import", status: imported.status, result: imported }],
        datasetsImported: 1,
        eventRowsImported: imported.matchesImported,
        aiCalls: 0,
        humanCouponLabTouched: false,
        note: "Owner-confirmed, bounded StatsBomb research import. It remains in the historical model lab only; no human coupons, predictions or live betting records were changed."
      };
    } else if (action === "sync_skillcorner_basketball") {
      const imported = await syncSkillCornerBasketballAggregates({
        confirmResearchUse: body?.confirmResearchUse
      });
      result = {
        status: imported.status,
        startedAt,
        completedAt: imported.completedAt,
        steps: [{ name: "skillcorner_acb_2025_26_player_season_aggregates", status: imported.status, result: imported }],
        datasetsImported: imported.datasetsImported,
        eventRowsImported: imported.totalRows,
        aiCalls: 0,
        humanCouponLabTouched: false,
        note: "Owner-confirmed SkillCorner ACB 2025/26 player-team-season aggregates only. These are not match-level results; no raw tracking files, human coupons, predictions or settlement records were imported."
      };
    } else {
      const steps: any[] = [];
      const execute = async (name: string, work: () => Promise<any>) => {
        try {
          const value = await work();
          steps.push({ name, status: value?.status || (value?.failures?.length ? "partial" : "completed"), result: value });
        } catch (error) {
          steps.push({ name, status: "failed", error: String(error).slice(0, 400) });
        }
      };
      await execute("openfootball_historical_results", syncOpenFootballHistoricalData);
      await execute("nflverse_american_football_play_by_play", () => syncNflversePlayByPlayData());
      await execute("openfootball_world_cup_and_player_events", syncOpenFootballWorldCupData);
      await execute("consensus_market_history", syncConsensusMarketDatasets);
      await execute("sharpapi_observed_market_snapshots", syncSharpApiSampleMarkets);
      await execute("chronological_openfootball_baseline", runOpenFootballBaselineLab);
      // Join eligible pre-match SharpAPI football snapshots to exact OpenFootball World Cup results.
      // Unsupported markets, ambiguous fixtures and non-football snapshots remain unresolved.
      await execute("historical_observed_market_settlement", settleObservedWorldCupMarkets);
      // Generate an out-of-time 70/30 benchmark report from imported consensus market datasets.
      await execute("chronological_market_calibration", runMarketCalibrationLab);
      const failed = steps.filter(x => x.status === "failed").length;
      const partial = steps.filter(x => x.status === "partial").length;
      result = {
        status: failed ? (steps.some(x => x.status === "completed" || x.status === "partial") ? "partial" : "failed") : partial ? "partial" : "completed",
        startedAt, completedAt: new Date().toISOString(), steps,
        datasetsImported: steps.reduce((n, x) => n + Number(x.result?.datasetsImported || x.result?.filesFetched || 0), 0),
        eventRowsImported: steps.reduce((n, x) => n + Number(x.result?.matchesImported || x.result?.rowsImported || 0), 0),
        aiCalls: 0, humanCouponLabTouched: false,
        note: "Only approved, source-specific adapters ran. Historical observed-price settlement is limited to eligible pre-match football snapshots that match exact OpenFootball World Cup fixtures and implemented market rules. Market calibration is a consensus benchmark with a chronological 70/30 holdout, not a WIN edge or ROI claim. The nflverse adapter imports licensed NFL play-by-play only; it does not add association-football coverage. No discovered candidate source was automatically connected, and no human coupon records were read or changed."
      };
    }

    const completedAt = new Date().toISOString();
    const record = { id: jobId, action, startedAt, completedAt, status: result?.status || "completed", result, aiCalls: 0 };
    await put("library/research-jobs", jobId, record);
    await put("scheduler-state", stateKey, {
      status: record.status, startedAt, lastCheck: completedAt, jobId, action,
      aiCalls: 0, summary: action === "discover_sources"
        ? { candidatesSeen: result?.candidatesSeen || 0, newCandidates: result?.newCandidates || 0, failures: result?.failures?.length || 0 }
        : { steps: result?.steps?.map((x: any) => ({ name: x.name, status: x.status })) || [] }
    });
    await putIfMatch("library/learning-data-job-locks", lockKey, {
      ...lock, status: record.status, completedAt, leaseExpiresAt: null
    }, lockEtag);
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = String(error).slice(0, 500);
    await put("library/research-jobs", jobId, { id: jobId, action, startedAt, completedAt, status: "failed", error: message, aiCalls: 0 });
    await put("scheduler-state", stateKey, { status: "failed", startedAt, lastCheck: completedAt, jobId, action, error: message, aiCalls: 0 });
    await putIfMatch("library/learning-data-job-locks", lockKey, {
      ...lock, status: "failed", completedAt, leaseExpiresAt: null, error: message
    }, lockEtag);
  }
  return Response.json({ accepted: true, status: "queued", action, jobId, aiCalls: 0 });
};

export const config: Config = { path: "/api/learning-data-jobs", background: true };
