import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { get, list } from "../lib/store.mts";
import { searchWinLibrary, saveCouponRecord, settleCouponRecord, saveEntityProfile, saveLearningNote } from "../lib/library.mts";
import { createSimulationRun } from "../lib/simulation.mts";
import { runStrategyBacktest } from "../lib/backtest.mts";
import { getTipsterSourceReport, importTipsterCoupon, listTipsterSources } from "../lib/source-intelligence.mts";
import { authorizeMcpRequest, WIN_ISSUER } from "../lib/oauth-store.mts";

const resourceMetadata = WIN_ISSUER + "/.well-known/oauth-protected-resource/mcp";

function authRequired(scope: string) {
  return {
    content: [{ type: "text" as const, text: "Connect or reauthorize WIN to grant " + scope + " access." }],
    isError: true,
    _meta: {
      "mcp/www_authenticate": [
        'Bearer resource_metadata="' + resourceMetadata + '", error="insufficient_scope", error_description="Connect to your WIN engine to use this tool."'
      ]
    }
  };
}

function buildServer(baseUrl: string, internalToken: string, scopes: string[]) {
  const server = new McpServer({ name: "WIN Worker Engine", version: "0.3.0" });

  server.registerTool("start_research_run", {
    title: "Start WIN multi-department research",
    description: "Start an on-demand WIN run through Public Offer & Scouting, all eight main departments, the dynamic sport/country/competition/event worker hierarchy, four adversarial reviewers and one Global Master. Use taskType build_latest_coupon to discover and compare current public candidates, audit_existing_coupon for a supplied coupon, or compare_coupons to compare a supplied coupon against a WIN alternative. No bet is placed.",
    inputSchema: {
      taskType: z.enum(["research_event", "build_latest_coupon", "audit_existing_coupon", "compare_coupons"]).optional(),
      event: z.string().min(3).optional(),
      sport: z.string().optional(),
      competition: z.string().optional(),
      country: z.string().optional(),
      dateTime: z.string().optional(),
      markets: z.array(z.string()).optional(),
      humanTips: z.array(z.any()).optional(),
      context: z.string().optional(),
      existingCoupon: z.string().optional(),
      targetCombinedOdds: z.number().positive().optional(),
      maxLegs: z.number().int().min(1).max(20).optional(),
      dateWindow: z.string().optional()
    },
    securitySchemes: [{ type: "oauth2", scopes: ["win:research"] }]
  }, async (args) => {
    if (!scopes.includes("win:research")) return authRequired("win:research");
    const event = args.event || (
      args.taskType === "build_latest_coupon" ? "LATEST PUBLIC STS PRE-MATCH COUPON" :
      args.taskType === "audit_existing_coupon" ? "USER-SUPPLIED COUPON AUDIT" :
      args.taskType === "compare_coupons" ? "COUPON COMPARISON" : ""
    );
    if (event.length < 3) {
      return { content: [{ type: "text" as const, text: "An event name is required for event research." }], isError: true };
    }
    const response = await fetch(baseUrl + "/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + internalToken },
      body: JSON.stringify({ ...args, event })
    });
    return { content: [{ type: "text" as const, text: await response.text() }], isError: !response.ok && response.status !== 202 };
  });

  server.registerTool("get_run", {
    title: "Get full WIN report",
    description: "Read a WIN run by its ID. Returns the dynamic worker-network tree, actual department worker statuses, specialist assignments, adversarial review, citations, handoffs, blockers and Global Master decision.",
    inputSchema: { runId: z.string() },
    securitySchemes: [{ type: "oauth2", scopes: ["win:read"] }]
  }, async ({ runId }) => {
    if (!scopes.includes("win:read")) return authRequired("win:read");
    const run = await get<any>("runs", runId);
    return { content: [{ type: "text" as const, text: JSON.stringify(run ?? { error: "Run not found" }) }] };
  });

  server.registerTool("list_runs", {
    title: "List WIN research",
    description: "List recent on-demand WIN research runs, status, type and Global Master decision.",
    inputSchema: {},
    securitySchemes: [{ type: "oauth2", scopes: ["win:read"] }]
  }, async () => {
    if (!scopes.includes("win:read")) return authRequired("win:read");
    const runs = await list<any>("runs", 50);
    return { content: [{ type: "text" as const, text: JSON.stringify(runs.map(run => ({
      id: run.id, taskType: run.brief?.taskType, event: run.brief?.event,
      status: run.status, createdAt: run.createdAt, completedAt: run.completedAt,
      decision: run.decision, workerNetworkSummary: run.workerNetwork?.executionSummary
    }))) }] };
  });

  server.registerTool("list_human_tips", {
    title: "List WIN tips",
    description: "List human tips and public or user-authorized inspiration material imported into WIN.",
    inputSchema: {},
    securitySchemes: [{ type: "oauth2", scopes: ["win:read"] }]
  }, async () => {
    if (!scopes.includes("win:read")) return authRequired("win:read");
    return { content: [{ type: "text" as const, text: JSON.stringify(await list("tips", 100)) }] };
  });

  server.registerTool("list_predictions", {
    title: "List frozen WIN forecasts",
    description: "Read frozen pre-event WIN forecast records, including run IDs and model response references.",
    inputSchema: {},
    securitySchemes: [{ type: "oauth2", scopes: ["win:read"] }]
  }, async () => {
    if (!scopes.includes("win:read")) return authRequired("win:read");
    return { content: [{ type: "text" as const, text: JSON.stringify(await list("predictions", 200)) }] };
  });


  server.registerTool("search_win_library", {
    title: "Search WIN Knowledge Library",
    description: "Search the private WIN library: winning, losing and pending human coupons, lessons, entity/agent profiles, observations and archived research. Mandatory before coupon construction.",
    inputSchema: {
      category: z.enum(["all", "winning", "losing", "pending", "coupons", "lessons", "entities", "agents", "observations", "runs", "tips", "notes", "coupon-history", "coupon-cases", "predictions", "results", "other-settlements", "learning-cycles", "strategies", "backtests"]).optional(),
      query: z.string().optional(), sport: z.string().optional(),
      entityType: z.enum(["sport", "country", "league", "club", "player", "event", "specialist"]).optional(),
      limit: z.number().int().min(1).max(100).optional()
    },
    securitySchemes: [{ type: "oauth2", scopes: ["win:read"] }]
  }, async (args) => {
    if (!scopes.includes("win:read")) return authRequired("win:read");
    return { content: [{ type: "text" as const, text: JSON.stringify(await searchWinLibrary(args)) }] };
  });

  server.registerTool("save_human_coupon", {
    title: "Save Human Coupon to WIN Library",
    description: "Save a human coupon. New coupons are pending settlement by default, then moved to the separate winning or losing collection only when supported by settlement evidence.",
    inputSchema: {
      label: z.string().optional(), couponText: z.string().min(3),
      selections: z.array(z.any()).optional(), sport: z.string().optional(),
      country: z.string().optional(), competition: z.string().optional(),
      combinedOdds: z.number().positive().optional(), bookmaker: z.string().optional(),
      notes: z.string().optional(), source: z.string().optional(),
      sourceType: z.string().optional(), tipsterName: z.string().optional(),
      publishedAt: z.string().optional(), sourceSnapshot: z.string().optional()
    },
    securitySchemes: [{ type: "oauth2", scopes: ["win:research"] }]
  }, async (args) => {
    if (!scopes.includes("win:research")) return authRequired("win:research");
    return { content: [{ type: "text" as const, text: JSON.stringify(await saveCouponRecord({ ...args, origin: "human", outcome: "pending" })) }] };
  });

  server.registerTool("record_coupon_outcome", {
    title: "Record Settled Coupon Outcome",
    description: "Save verified coupon settlement. Winning and losing cases are stored separately; void, partial and cancelled coupons remain separately classified.",
    inputSchema: {
      couponId: z.string().min(1),
      outcome: z.enum(["won", "lost", "void", "partial", "cancelled"]),
      settlementSource: z.string().min(3), evidence: z.array(z.any()).optional(),
      settledAt: z.string().optional()
    },
    securitySchemes: [{ type: "oauth2", scopes: ["win:research"] }]
  }, async (args) => {
    if (!scopes.includes("win:research")) return authRequired("win:research");
    return { content: [{ type: "text" as const, text: JSON.stringify(await settleCouponRecord(args)) }] };
  });

  server.registerTool("save_win_entity_profile", {
    title: "Create or Update WIN Entity Agent",
    description: "Create or update a persistent on-demand profile for a sport, country, league, club, player or event, with a stable agent identity and scoped research mission.",
    inputSchema: {
      entityType: z.enum(["sport", "country", "league", "club", "player", "event"]),
      name: z.string().min(1), id: z.string().optional(),
      sport: z.string().optional(), country: z.string().optional(),
      competition: z.string().optional(), club: z.string().optional(),
      profile: z.any().optional(), sources: z.array(z.any()).optional(),
      agentMission: z.string().optional()
    },
    securitySchemes: [{ type: "oauth2", scopes: ["win:research"] }]
  }, async (args) => {
    if (!scopes.includes("win:research")) return authRequired("win:research");
    return { content: [{ type: "text" as const, text: JSON.stringify(await saveEntityProfile(args)) }] };
  });

  server.registerTool("save_win_learning_note", {
    title: "Save WIN Agent Learning Note",
    description: "Store a dated lesson or agent note. New lessons remain candidates for validation until an authorized reviewer supplies evidence.",
    inputSchema: {
      title: z.string().optional(), note: z.string().min(3),
      agentId: z.string().optional(), runId: z.string().optional(),
      entityType: z.string().optional(), entityId: z.string().optional(),
      evidence: z.array(z.any()).optional(), sampleSize: z.number().int().nonnegative().optional()
    },
    securitySchemes: [{ type: "oauth2", scopes: ["win:research"] }]
  }, async (args) => {
    if (!scopes.includes("win:research")) return authRequired("win:research");
    return { content: [{ type: "text" as const, text: JSON.stringify(await saveLearningNote(args)) }] };
  });

  server.registerTool("validate_win_lesson", {
    title: "Validate WIN Library Lesson",
    description: "Validate a proposed lesson only when evidence references are supplied. Only validated lessons are reused as established knowledge in later coupon reviews.",
    inputSchema: { lessonId: z.string().min(1), evidence: z.array(z.any()).min(1) },
    securitySchemes: [{ type: "oauth2", scopes: ["win:research"] }]
  }, async (args) => {
    if (!scopes.includes("win:research")) return authRequired("win:research");
    const lesson = await get<any>("library/lessons", args.lessonId);
    if (!lesson) return { content: [{ type: "text" as const, text: "Lesson not found." }], isError: true };
    const updated = { ...lesson, validationStatus: "validated", validationEvidence: args.evidence.slice(0, 30), validatedAt: new Date().toISOString() };
    const { put } = await import("../lib/store.mts");
    await put("library/lessons", args.lessonId, updated);
    return { content: [{ type: "text" as const, text: JSON.stringify(updated) }] };
  });

  server.registerTool("run_historical_coupon_simulation", {
    title: "Run WIN historical coupon simulation",
    description: "Generate reproducible random coupon combinations from supplied real historical selections with pre-event odds timestamps and verified settled outcomes. Saves experimental winning and losing coupons separately. This is descriptive construction analysis, not a predictive-edge proof.",
    inputSchema: {
      selections: z.array(z.any()).min(2).max(10000),
      couponCount: z.number().int().min(100).max(100000).optional(),
      minLegs: z.number().int().min(2).max(50).optional(),
      maxLegs: z.number().int().min(2).max(50).optional(),
      seed: z.string().optional()
    },
    securitySchemes: [{ type: "oauth2", scopes: ["win:research"] }]
  }, async (args) => {
    if (!scopes.includes("win:research")) return authRequired("win:research");
    try {
      const run = await createSimulationRun(args);
      const queued = await fetch(baseUrl + "/.netlify/functions/simulation-runner", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + internalToken },
        body: JSON.stringify({ runId: run.id })
      });
      if (!queued.ok && queued.status !== 202) throw new Error("Simulation worker could not be queued: HTTP " + queued.status);
      return { content: [{ type: "text" as const, text: JSON.stringify({ runId: run.id, status: "queued", couponCount: run.couponCount, selectionCount: run.selectionCount, message: "Historical simulation queued. Results are derived only from supplied settled data." }) }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: String(error) }], isError: true };
    }
  });


  server.registerTool("run_strategy_backtest", {
    title: "Run WIN chronological strategy backtest",
    description: "Test a fixed, user-defined strategy filter against supplied historical selections using chronological 60/20/20 training, validation and holdout periods. Requires pre-event odds timestamps, source provenance and settled outcomes. Reports hit rate with Wilson interval, flat-stake ROI, Brier score when probabilities are supplied and closing-price movement when available. It never auto-validates a strategy; retrospective results are not proof of future edge.",
    inputSchema: {
      strategyName: z.string().optional(),
      strategyHypothesis: z.string().optional(),
      filters: z.object({
        sports: z.array(z.string()).optional(),
        countries: z.array(z.string()).optional(),
        competitions: z.array(z.string()).optional(),
        markets: z.array(z.string()).optional(),
        minOdds: z.number().gt(1).optional(),
        maxOdds: z.number().gt(1).optional()
      }).optional(),
      selections: z.array(z.any()).min(10).max(10000)
    },
    securitySchemes: [{ type: "oauth2", scopes: ["win:research"] }]
  }, async (args) => {
    if (!scopes.includes("win:research")) return authRequired("win:research");
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(await runStrategyBacktest(args)) }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: String(error) }], isError: true };
    }
  });

  server.registerTool("list_tipster_sources", {
    title: "List WIN public tipster sources",
    description: "List known tipster research sources, current collection permissions, and safe import modes. Automated collection is disabled unless official API access or written permission is recorded.",
    inputSchema: {},
    securitySchemes: [{ type: "oauth2", scopes: ["win:read"] }]
  }, async () => {
    if (!scopes.includes("win:read")) return authRequired("win:read");
    return { content: [{ type: "text" as const, text: JSON.stringify(listTipsterSources()) }] };
  });

  server.registerTool("get_tipster_source_report", {
    title: "Get WIN tipster import report",
    description: "Review public/user-authorized tipster coupon imports, source totals and pending settlement counts.",
    inputSchema: {},
    securitySchemes: [{ type: "oauth2", scopes: ["win:read"] }]
  }, async () => {
    if (!scopes.includes("win:read")) return authRequired("win:read");
    return { content: [{ type: "text" as const, text: JSON.stringify(await getTipsterSourceReport()) }] };
  });

  server.registerTool("import_public_tipster_coupon", {
    title: "Import a public tipster coupon into WIN",
    description: "Import coupon details supplied by the user or an authorized export. Requires an HTTPS source URL and an explicit attestation that the user is entitled to provide and retain the data. New records remain pending until independently evidenced settlement. This tool does not log in, scrape, or bypass restrictions.",
    inputSchema: {
      sourceId: z.enum(["sts-strefa-inspiracji", "tippium", "blogabet", "tipstrr", "oddra"]),
      sourceUrl: z.string().url(), couponText: z.string().min(3),
      authorizedToStore: z.boolean(),
      tipsterName: z.string().optional(), publishedAt: z.string().optional(),
      label: z.string().optional(), sport: z.string().optional(),
      country: z.string().optional(), competition: z.string().optional(),
      combinedOdds: z.number().positive().optional(), bookmaker: z.string().optional(),
      selections: z.array(z.any()).optional(), sourceSnapshot: z.string().optional(),
      importMethod: z.enum(["manual_user_submission", "user_provided_export", "official_api", "written_permission"]).optional()
    },
    securitySchemes: [{ type: "oauth2", scopes: ["win:research"] }]
  }, async (args) => {
    if (!scopes.includes("win:research")) return authRequired("win:research");
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(await importTipsterCoupon(args)) }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: String(error) }], isError: true };
    }
  });

  return server;
}

export default async (req: Request) => {
  const authorization = await authorizeMcpRequest(req);
  if (!authorization.ok) {
    return new Response(JSON.stringify({ error: "unauthorized", message: "Connect or reauthorize WIN to use its research tools." }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "www-authenticate": 'Bearer resource_metadata="' + resourceMetadata + '", scope="win:read win:research"'
      }
    });
  }

  const internalToken = Netlify.env.get("WIN_INTERNAL_TOKEN");
  if (!internalToken) return new Response("WIN_INTERNAL_TOKEN is not configured", { status: 503 });
  const server = buildServer(WIN_ISSUER, internalToken, authorization.scopes);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
};

export const config = {
  path: "/mcp",
  rateLimit: { windowSize: 60, windowLimit: 40, aggregateBy: ["ip"] }
};
