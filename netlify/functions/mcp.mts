import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { get, list } from "../lib/store.mts";
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

  return server;
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
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
