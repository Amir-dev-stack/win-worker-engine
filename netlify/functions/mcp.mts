import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { get, list } from "../lib/store.mts";
import { authorizeMcpRequest, WIN_ISSUER } from "../lib/oauth-store.mts";

function scopeError(scopes: string[], required: string) {
  return { content: [{ type: "text" as const, text: "This WIN connection does not have the required permission: " + required }] , isError: true };
}

function buildServer(baseUrl: string, internalToken: string, scopes: string[]) {
  const server = new McpServer({ name: "WIN Worker Engine", version: "0.2.0" });

  server.tool("start_research_run", "Start a new independent WIN research and debate run. No bet is placed.", {
    event: z.string().min(3), sport: z.string().optional(), competition: z.string().optional(), country: z.string().optional(),
    dateTime: z.string().optional(), markets: z.array(z.string()).optional(),
    humanTips: z.array(z.any()).optional(), context: z.string().optional()
  }, async (args) => {
    if (!scopes.includes("win:research")) return scopeError(scopes, "win:research");
    const response = await fetch(baseUrl + "/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + internalToken },
      body: JSON.stringify({ event: args.event, ...args })
    });
    return { content: [{ type: "text" as const, text: await response.text() }], isError: !response.ok && response.status !== 202 };
  });

  server.tool("get_run", "Read a WIN run by its ID", { runId: z.string() }, async ({ runId }) => {
    if (!scopes.includes("win:read")) return scopeError(scopes, "win:read");
    const run = await get<any>("runs", runId);
    return { content: [{ type: "text" as const, text: JSON.stringify(run ?? { error: "Run not found" }) }] };
  });

  server.tool("list_runs", "List recent WIN research runs", {}, async () => {
    if (!scopes.includes("win:read")) return scopeError(scopes, "win:read");
    return { content: [{ type: "text" as const, text: JSON.stringify(await list("runs", 50)) }] };
  });

  server.tool("list_human_tips", "List user-imported public or authorized human tips", {}, async () => {
    if (!scopes.includes("win:read")) return scopeError(scopes, "win:read");
    return { content: [{ type: "text" as const, text: JSON.stringify(await list("tips", 100)) }] };
  });

  server.tool("list_predictions", "Read the frozen WIN prediction ledger", {}, async () => {
    if (!scopes.includes("win:read")) return scopeError(scopes, "win:read");
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
        "www-authenticate": 'Bearer realm="WIN", resource_metadata="' + WIN_ISSUER + '/.well-known/oauth-protected-resource/mcp", scope="win:read win:research"'
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
