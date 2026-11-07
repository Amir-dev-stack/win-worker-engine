import type { Config } from "@netlify/functions";
import { randomUUID } from "node:crypto";
import { readOAuthJsonBody } from "../lib/oauth-request.mts";
import { saveOAuthRecord } from "../lib/oauth-store.mts";

function validRedirect(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return false;

    // Hosted ChatGPT OAuth callback.
    if (url.protocol === "https:" && url.hostname === "chatgpt.com") {
      return url.pathname === "/connector_platform_oauth_redirect" ||
        /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(url.pathname);
    }
    if (url.protocol === "https:" && url.hostname === "chat.openai.com") {
      return url.pathname.startsWith("/aip/");
    }

    // Native clients use an ephemeral loopback port (RFC 8252).
    // Permit the standard /callback path and an optional opaque callback id,
    // but never arbitrary paths, non-loopback hosts, credentials or query data.
    const loopbackHost = url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" || url.hostname === "[::1]";
    if (url.protocol === "http:" && loopbackHost) {
      return url.pathname === "/callback" ||
        /^\/callback\/[A-Za-z0-9_-]+$/.test(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const parsedBody = await readOAuthJsonBody(req);
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody.body;

  const redirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
  if (!redirectUris.length || redirectUris.length > 10 || !redirectUris.every(validRedirect)) {
    return Response.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
    return Response.json({ error: "unsupported_token_endpoint_auth_method" }, { status: 400 });
  }
  if (body.grant_types !== undefined && (!Array.isArray(body.grant_types) ||
      !body.grant_types.includes("authorization_code") ||
      body.grant_types.some((x: string) => !["authorization_code", "refresh_token"].includes(x)))) {
    return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
  }
  if (body.response_types !== undefined && (!Array.isArray(body.response_types) ||
      !body.response_types.includes("code") || body.response_types.some((x: string) => x !== "code"))) {
    return Response.json({ error: "unsupported_response_type" }, { status: 400 });
  }

  const clientId = randomUUID();
  const clientName = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : "WIN ChatGPT client";
  const record = { clientId, clientName, redirectUris, createdAt: Date.now() };
  await saveOAuthRecord("clients", clientId, record);

  return Response.json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: "win:read win:research offline_access"
  }, { status: 201, headers: { "cache-control": "no-store" } });
};

export const config: Config = {
  path: "/oauth/register",
  rateLimit: { windowSize: 60, windowLimit: 10, aggregateBy: ["ip"] }
};
