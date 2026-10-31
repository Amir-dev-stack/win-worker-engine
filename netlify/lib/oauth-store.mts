import { getStore } from "@netlify/blobs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const WIN_ISSUER = "https://win-worker-engine.netlify.app";
export const WIN_RESOURCE = WIN_ISSUER + "/mcp";
export const WIN_SCOPES = ["win:read", "win:research"] as const;

const store = getStore({ name: "win-oauth", region: "eu-central-1", consistency: "strong" });
const recordKey = (kind: string, id: string) => "oauth/" + kind + "/" + id;

export function randomSecret(prefix: string): string {
  return prefix + "_" + randomBytes(32).toString("base64url");
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function saveOAuthRecord(kind: string, id: string, value: unknown): Promise<void> {
  await store.setJSON(recordKey(kind, id), value);
}

export async function readOAuthRecord<T>(kind: string, id: string): Promise<T | null> {
  return await store.get(recordKey(kind, id), { type: "json" }) as T | null;
}

export async function validateOwnerToken(value: string): Promise<boolean> {
  const expected = Netlify.env.get("WIN_INTERNAL_TOKEN");
  return Boolean(expected && value && safeEqual(value, expected));
}

export type McpAuthorization = { ok: boolean; scopes: string[]; reason?: string };

export async function authorizeMcpRequest(req: Request): Promise<McpAuthorization> {
  const match = req.headers.get("authorization")?.match(/^Bearer\\s+(.+)$/i);
  if (!match) return { ok: false, scopes: [], reason: "missing_bearer" };
  const bearer = match[1];

  // Keep existing dashboard/service-token compatibility while supporting OAuth for ChatGPT.
  const ownerToken = Netlify.env.get("WIN_INTERNAL_TOKEN");
  if (ownerToken && safeEqual(bearer, ownerToken)) {
    return { ok: true, scopes: [...WIN_SCOPES] };
  }

  const record = await readOAuthRecord<any>("access", hashSecret(bearer));
  if (!record || typeof record.expiresAt !== "number" || record.expiresAt <= Date.now()) {
    return { ok: false, scopes: [], reason: "invalid_token" };
  }
  if (record.audience !== WIN_RESOURCE || !Array.isArray(record.scopes)) {
    return { ok: false, scopes: [], reason: "invalid_audience_or_scope" };
  }
  return { ok: true, scopes: record.scopes.filter((s: string) => (WIN_SCOPES as readonly string[]).includes(s)) };
}

export async function issueTokenPair(clientId: string, audience: string, scopes: string[]) {
  const now = Date.now();
  const accessToken = randomSecret("win_at");
  const refreshToken = randomSecret("win_rt");
  await saveOAuthRecord("access", hashSecret(accessToken), {
    clientId, audience, scopes, createdAt: now, expiresAt: now + 60 * 60 * 1000
  });
  await saveOAuthRecord("refresh", hashSecret(refreshToken), {
    clientId, audience, scopes, createdAt: now, expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    consumedAt: null
  });
  return { accessToken, refreshToken, expiresIn: 3600 };
}
