import type { Config } from "@netlify/functions";
import {
  WIN_RESOURCE, issueTokenPair, hashSecret, readOAuthRecord, saveOAuthRecord
} from "../lib/oauth-store.mts";

type CodeRecord = {
  clientId: string; redirectUri: string; challenge: string; audience: string;
  scopes: string[]; createdAt: number; expiresAt: number; consumedAt?: number;
};
type RefreshRecord = {
  clientId: string; audience: string; scopes: string[]; expiresAt: number; consumedAt?: number;
};

function fail(error: string, status = 400) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let form: FormData;
  try { form = await req.formData(); } catch { return fail("invalid_request"); }

  const grantType = String(form.get("grant_type") || "");
  const clientId = String(form.get("client_id") || "");
  const audienceParam = String(form.get("resource") || "");

  if (grantType === "authorization_code") {
    const code = String(form.get("code") || "");
    const redirectUri = String(form.get("redirect_uri") || "");
    const verifier = String(form.get("code_verifier") || "");
    if (!code || !clientId || !redirectUri || !verifier || verifier.length < 43 || verifier.length > 128) {
      return fail("invalid_request");
    }
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = Buffer.from(hash).toString("base64url");
    const record = await readOAuthRecord<CodeRecord>("codes", hashSecret(code));
    if (!record || record.consumedAt || record.expiresAt <= Date.now()) return fail("invalid_grant");
    if (record.clientId !== clientId || record.redirectUri !== redirectUri || record.challenge !== challenge ||
        record.audience !== WIN_RESOURCE || (audienceParam && audienceParam !== record.audience)) {
      return fail("invalid_grant");
    }
    await saveOAuthRecord("codes", hashSecret(code), { ...record, consumedAt: Date.now() });
    const pair = await issueTokenPair(clientId, record.audience, record.scopes);
    return Response.json({
      access_token: pair.accessToken, token_type: "Bearer", expires_in: pair.expiresIn,
      refresh_token: pair.refreshToken, scope: record.scopes.join(" ")
    }, { headers: { "cache-control": "no-store", pragma: "no-cache" } });
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") || "");
    if (!refreshToken || !clientId) return fail("invalid_request");
    const key = hashSecret(refreshToken);
    const record = await readOAuthRecord<RefreshRecord>("refresh", key);
    if (!record || record.consumedAt || record.expiresAt <= Date.now() || record.clientId !== clientId ||
        record.audience !== WIN_RESOURCE || (audienceParam && audienceParam !== record.audience)) {
      return fail("invalid_grant");
    }
    await saveOAuthRecord("refresh", key, { ...record, consumedAt: Date.now() });
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
