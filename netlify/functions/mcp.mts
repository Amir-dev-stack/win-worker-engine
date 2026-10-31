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
  const server = new McpServer({ name: "WIN Worker Engine", version: "0.2.0" });

  server.registerTool("start_research_run", {
    title: "Start WIN research",
    description: "Start the on-demand WIN specialist research, adversarial review and Global Master workflow. This does not place a bet.",
    inputSchema: {
      event: z.string().min(3),
      sport: z.string().optional(),
      competition: z.string().optional(),
      country: z.string().optional(),
      dateTime: z.string().optional(),
      markets: z.array(z.string()).optional(),
      humanTips: z.array(z.any()).optional(),
      context: z.string().optional()
    },
    securitySchemes: [{ type: "oauth2", scopes: ["win:research"] }]
  }, async (args) => {
    if (!scopes.includes("win:research")) return authRequired("win:research");
    const response = await fetch(baseUrl + "/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + internalToken },
      body: JSON.stringify({ event: args.event, ...args })
    });
    return { content: [{ type: "text" as const, text: await response.text() }], isError: !response.ok && response.status !== 202 };
  });

  server.registerTool("get_run", {
    title: "Get WIN research report",
    description: "Read the complete WIN report, including worker findings, challenge reports, citations, errors and Global Master decision.",
    inputSchema: { runId: z.string() },
    securitySchemes: [{ type: "oauth2", scopes: ["win:read"] }]
  }, async ({ runId }) => {
    if (!scopes.includes("win:read")) return authRequired("win:read");
    const run = await get<any>("runs", runId);
    return { content: [{ type: "text" as const, text: JSON.stringify(run ?? { error: "Run not found" }) }] };
  });

  server.registerTool("list_runs", {
    title: "List WIN research",
    description: "List recent on-demand WIN research runs and their status.",
    inputSchema: {},
    securitySchemes: [{ type: "oauth2", scopes: ["win:read"] }]
  }, async () => {
    if (!scopes.includes("win:read")) return authRequired("win:read");
    return { content: [{ type: "text" as const, text: JSON.stringify(await list("runs", 50)) }] };
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
    description: "Read the WIN frozen pre-event forecast ledger.",
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
