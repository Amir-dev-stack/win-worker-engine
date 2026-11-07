import type { Config } from "@netlify/functions";
import { readOAuthFormBody } from "../lib/oauth-request.mts";
import {
  WIN_RESOURCE, issueTokenPair, hashSecret, readOAuthRecordWithMetadata, consumeOAuthRecord
} from "../lib/oauth-store.mts";

type CodeRecord = {
  issuer: string; clientId: string; redirectUri: string; challenge: string; audience: string;
  scopes: string[]; createdAt: number; expiresAt: number; consumedAt?: number;
};
type RefreshRecord = {
  issuer: string; clientId: string; audience: string; scopes: string[]; expiresAt: number; consumedAt?: number;
};

function fail(error: string, status = 400) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const parsedForm = await readOAuthFormBody(req);
  if (parsedForm instanceof Response) return parsedForm;
  const form = parsedForm.params;

  const grantType = form.get("grant_type") || "";
  const clientId = form.get("client_id") || "";
  const audienceParam = form.get("resource") || "";

  if (!clientId || clientId.length > 128 || audienceParam !== WIN_RESOURCE) return fail("invalid_target_or_client");

  if (grantType === "authorization_code") {
    const code = form.get("code") || "";
    const redirectUri = form.get("redirect_uri") || "";
    const verifier = form.get("code_verifier") || "";
    if (!code || code.length > 256 || !redirectUri || redirectUri.length > 2048 || !verifier || verifier.length < 43 || verifier.length > 128) {
      return fail("invalid_request");
    }
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = Buffer.from(hash).toString("base64url");
    const stored = await readOAuthRecordWithMetadata<CodeRecord>("codes", hashSecret(code));
    const record = stored?.value;
    if (!record || !stored || record.consumedAt || record.expiresAt <= Date.now()) return fail("invalid_grant");
    if (record.issuer !== "https://win-worker-engine.netlify.app" || record.clientId !== clientId || record.redirectUri !== redirectUri || record.challenge !== challenge ||
        record.audience !== WIN_RESOURCE) return fail("invalid_grant");

    if (!await consumeOAuthRecord("codes", hashSecret(code), { ...record, consumedAt: Date.now() }, stored.etag)) return fail("invalid_grant");
    const pair = await issueTokenPair(clientId, record.audience, record.scopes);
    return Response.json({
      access_token: pair.accessToken, token_type: "Bearer", expires_in: pair.expiresIn,
      refresh_token: pair.refreshToken, scope: record.scopes.join(" ")
    }, { headers: { "cache-control": "no-store", pragma: "no-cache" } });
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token") || "";
    if (!refreshToken || refreshToken.length > 256) return fail("invalid_request");
    const key = hashSecret(refreshToken);
    const stored = await readOAuthRecordWithMetadata<RefreshRecord>("refresh", key);
    const record = stored?.value;
    if (!record || !stored || record.consumedAt || record.expiresAt <= Date.now() || record.clientId !== clientId ||
        record.issuer !== "https://win-worker-engine.netlify.app" || record.audience !== WIN_RESOURCE) {
      return fail("invalid_grant");
    }
    if (!await consumeOAuthRecord("refresh", key, { ...record, consumedAt: Date.now() }, stored.etag)) return fail("invalid_grant");
    const pair = await issueTokenPair(clientId, record.audience, record.scopes);
    return Response.json({
      access_token: pair.accessToken, token_type: "Bearer", expires_in: pair.expiresIn,
      refresh_token: pair.refreshToken, scope: record.scopes.join(" ")
    }, { headers: { "cache-control": "no-store", pragma: "no-cache" } });
  }

  return fail("unsupported_grant_type");
};

export const config: Config = {
  path: "/oauth/token",
  rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ["ip"] }
};
