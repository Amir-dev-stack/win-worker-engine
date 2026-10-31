import type { Config } from "@netlify/functions";
import { WIN_ISSUER, WIN_RESOURCE, WIN_SCOPES } from "../lib/oauth-store.mts";

export default async (req: Request) => {
  const path = new URL(req.url).pathname;
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" };

  if (path === "/.well-known/oauth-authorization-server") {
    return Response.json({
      issuer: WIN_ISSUER,
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: false,
      authorization_endpoint: WIN_ISSUER + "/oauth/authorize",
      token_endpoint: WIN_ISSUER + "/oauth/token",
      registration_endpoint: WIN_ISSUER + "/oauth/register",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [...WIN_SCOPES]
    }, { headers });
  }

  return Response.json({
    resource: WIN_RESOURCE,
    authorization_servers: [WIN_ISSUER],
    bearer_methods_supported: ["header"],
    scopes_supported: [...WIN_SCOPES]
  }, { headers });
};

export const config: Config = {
  path: ["/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource/mcp"]
};
