import type { Config } from "@netlify/functions";
import { readOAuthFormBody } from "../lib/oauth-request.mts";
import { randomUUID } from "node:crypto";
import {
  WIN_ISSUER, WIN_RESOURCE, WIN_SCOPES, randomSecret, saveOAuthRecord,
  readOAuthRecord, readOAuthRecordWithMetadata, consumeOAuthRecord, validateOwnerToken, hashSecret
} from "../lib/oauth-store.mts";

type ClientRecord = { clientId: string; clientName: string; redirectUris: string[] };
type AuthRequest = {
  clientId: string; redirectUri: string; state: string; challenge: string;
  audience: string; scopes: string[]; expiresAt: number; consumedAt?: number;
  completedCode?: string; codeExpiresAt?: number;
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));
export function describeOAuthScopes(scope: string): string {
  const requested = new Set(scope.split(/\s+/).filter(Boolean));
  const permissions: string[] = [];
  if (requested.has("win:audit")) permissions.push("Read-only diagnostics: observatory status, historical dataset metadata, calibration and settlement records, reviewer operations and learning history.");
  if (requested.has("win:read")) permissions.push("Read WIN research records, predictions, tips and library data.");
  if (requested.has("win:research")) permissions.push("Start research runs and submit research/library records. This does not place bets or access an STS account.");
  if (requested.has("offline_access")) permissions.push("Keep the connection active using refresh tokens.");
  return permissions.length ? permissions.join(" ") : "No WIN data or research permissions requested.";
}

const page = (txn: string, client: string, scope: string, error = "") => {
  const permissionText = describeOAuthScopes(scope);
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect WIN</title>
<style>
body{font:16px system-ui;background:#0b1020;color:#edf2ff;display:grid;min-height:100vh;place-items:center;margin:0}
main{width:min(440px,calc(100% - 40px));background:#151d31;border:1px solid #34415d;border-radius:18px;padding:28px;box-sizing:border-box}
h1{margin:0 0 10px;font-size:25px}p{color:#bac6dc;line-height:1.5}label{display:block;margin:18px 0 8px;font-size:14px}
input{width:100%;box-sizing:border-box;padding:13px;border-radius:9px;border:1px solid #51617e;background:#0b1020;color:white}
button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:9px;background:#b7d4ff;color:#10182a;font-weight:700;cursor:pointer}
.error{color:#ffb7b7}.scope{padding:10px;background:#0b1020;border-radius:8px;font-size:13px;color:#cad5e9}
</style><main><h1>Connect WIN to ChatGPT</h1>
<p><b>${escapeHtml(client)}</b> is requesting permission to use your WIN research engine.</p>
<p class="scope">Permissions: ${escapeHtml(scope)}<br>${escapeHtml(permissionText)}</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="txn" value="${escapeHtml(txn)}">
<label for="ownerToken">WIN internal token</label>
<input id="ownerToken" name="ownerToken" type="password" autocomplete="current-password" required>
<button type="submit">Authorize WIN connection</button>
</form><p>Use the same private token you use to connect the WIN dashboard. It is checked on this secure WIN website and is not added to the plugin.</p></main></html>`;
};

function scopesFrom(value: string): string[] | null {
  const requested = value.trim() ? value.trim().split(/\s+/) : [];
  if (!requested.length || requested.some(s => !(WIN_SCOPES as readonly string[]).includes(s))) return null;
  return [...new Set(requested)];
}

function redirectAuthorizationError(redirectUri: string, state: string, error: string, description: string): Response {
  const callback = new URL(redirectUri);
  callback.searchParams.set("error", error);
  callback.searchParams.set("error_description", description);
  callback.searchParams.set("state", state);
  callback.searchParams.set("iss", WIN_ISSUER);
  return Response.redirect(callback.toString(), 303);
}

export default async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const clientId = url.searchParams.get("client_id") || "";
    const redirectUri = url.searchParams.get("redirect_uri") || "";
    const responseType = url.searchParams.get("response_type") || "";
    const state = url.searchParams.get("state") || "";
    const challenge = url.searchParams.get("code_challenge") || "";
    const method = url.searchParams.get("code_challenge_method") || "";
    const audience = url.searchParams.get("resource") || "";
    const scopeValue = url.searchParams.get("scope") || "";
    const scopes = scopeValue.length <= 512 ? scopesFrom(scopeValue) : null;
    const client = await readOAuthRecord<ClientRecord>("clients", clientId);

    // Never redirect to a URI that was not registered for this exact client.
    if (!client || clientId.length > 128 || redirectUri.length > 2048 || !client.redirectUris.includes(redirectUri) || !state || state.length > 1024) {
      return new Response("Invalid OAuth client, redirect URI, or state.", { status: 400 });
    }
    if (responseType !== "code" || !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
        method !== "S256" || audience !== WIN_RESOURCE || !scopes) {
      return redirectAuthorizationError(
        redirectUri, state, "invalid_request",
        "The authorization request is missing a valid PKCE challenge, resource, response type, or supported scope."
      );
    }

    const txn = randomUUID();
    const record: AuthRequest = {
      clientId, redirectUri, state, challenge, audience, scopes,
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    await saveOAuthRecord("requests", txn, record);
    return new Response(page(txn, client.clientName, scopes.join(" ")), {
      headers: {
        "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff", "referrer-policy": "no-referrer"
      }
    });
  }

  if (req.method === "POST") {
    const parsedForm = await readOAuthFormBody(req, 8 * 1024);
    if (parsedForm instanceof Response) return parsedForm;
    const txn = parsedForm.params.get("txn") || "";
    const ownerToken = parsedForm.params.get("ownerToken") || "";
    const storedAuth = await readOAuthRecordWithMetadata<AuthRequest>("requests", txn);
    const auth = storedAuth?.value;
    if (!auth || !storedAuth || auth.expiresAt <= Date.now()) {
      return new Response("Authorization request expired. Start connecting WIN again.", { status: 400 });
    }
    const client = await readOAuthRecord<ClientRecord>("clients", auth.clientId);
    if (!client || !client.redirectUris.includes(auth.redirectUri)) {
      return new Response("Invalid OAuth client.", { status: 400 });
    }
    // A browser may retry or resubmit after the first POST has already
    // authorized the transaction. Reuse the same short-lived code rather
    // than treating that harmless retry as an expired authorization.
    if (auth.consumedAt) {
      if (auth.completedCode && auth.codeExpiresAt && auth.codeExpiresAt > Date.now()) {
        const callback = new URL(auth.redirectUri);
        callback.searchParams.set("code", auth.completedCode);
        callback.searchParams.set("state", auth.state);
        callback.searchParams.set("iss", WIN_ISSUER);
        return Response.redirect(callback.toString(), 303);
      }
      return new Response("Authorization request expired. Start connecting WIN again.", { status: 400 });
    }
    if (!await validateOwnerToken(ownerToken)) {
      return new Response(page(txn, client.clientName, auth.scopes.join(" "), "The WIN internal token was not accepted. Check it and try again."), {
        status: 401, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
      });
    }

    const code = randomSecret("win_code");
    const codeExpiresAt = Date.now() + 3 * 60 * 1000;
    await saveOAuthRecord("codes", hashSecret(code), {
      issuer: WIN_ISSUER,
      clientId: auth.clientId, redirectUri: auth.redirectUri, challenge: auth.challenge,
      audience: auth.audience, scopes: auth.scopes, createdAt: Date.now(),
      expiresAt: codeExpiresAt
    });
    const claimed = await consumeOAuthRecord("requests", txn, {
      ...auth, consumedAt: Date.now(), completedCode: code, codeExpiresAt
    }, storedAuth.etag);
    if (!claimed) {
      // Concurrent browser submissions may each stage a short-lived code, but
      // only the request-record CAS winner is ever returned to the client.
      const winner = await readOAuthRecord<AuthRequest>("requests", txn);
      if (winner?.consumedAt && winner.completedCode && winner.codeExpiresAt && winner.codeExpiresAt > Date.now()) {
        const callback = new URL(winner.redirectUri);
        callback.searchParams.set("code", winner.completedCode);
        callback.searchParams.set("state", winner.state);
        callback.searchParams.set("iss", WIN_ISSUER);
        return Response.redirect(callback.toString(), 303);
      }
      return new Response("Authorization request was already consumed. Start connecting WIN again.", { status: 409 });
    }
    const callback = new URL(auth.redirectUri);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", auth.state);
    callback.searchParams.set("iss", WIN_ISSUER);
    return Response.redirect(callback.toString(), 303);
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/oauth/authorize",
  rateLimit: { windowSize: 60, windowLimit: 20, aggregateBy: ["ip"] }
};
