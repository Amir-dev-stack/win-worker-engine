import { getStore } from "@netlify/blobs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const WIN_ISSUER = "https://win-worker-engine.netlify.app";
export const WIN_RESOURCE = WIN_ISSUER + "/mcp";
export const WIN_SCOPES = ["win:audit", "win:read", "win:research", "offline_access"] as const;

const store = getStore({ name: "win-oauth", consistency: "strong" });
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
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, scopes: [], reason: "missing_bearer" };
  const bearer = match[1];

  const ownerToken = Netlify.env.get("WIN_INTERNAL_TOKEN");
  if (ownerToken && safeEqual(bearer, ownerToken)) {
    return { ok: true, scopes: [...WIN_SCOPES] };
  }

  const record = await readOAuthRecord<any>("access", hashSecret(bearer));
  if (!record) return { ok: false, scopes: [], reason: "unknown_token" };
  if (typeof record.expiresAt !== "number" || record.expiresAt <= Date.now()) {
    return { ok: false, scopes: [], reason: "expired_token" };
  }
  if (record.issuer !== WIN_ISSUER) return { ok: false, scopes: [], reason: "wrong_issuer" };
  if (record.audience !== WIN_RESOURCE) return { ok: false, scopes: [], reason: "wrong_audience" };
  if (!Array.isArray(record.scopes)) return { ok: false, scopes: [], reason: "invalid_scope_record" };
  const scopes = record.scopes.filter((s: string) => (WIN_SCOPES as readonly string[]).includes(s));
  if (!scopes.length) return { ok: false, scopes: [], reason: "no_supported_scopes" };
  return { ok: true, scopes };
}

export async function issueTokenPair(clientId: string, audience: string, scopes: string[]) {
  const now = Date.now();
  const accessToken = randomSecret("win_at");
  const refreshToken = randomSecret("win_rt");
  await saveOAuthRecord("access", hashSecret(accessToken), {
    issuer: WIN_ISSUER, clientId, audience, scopes, createdAt: now, expiresAt: now + 60 * 60 * 1000
  });
  await saveOAuthRecord("refresh", hashSecret(refreshToken), {
    issuer: WIN_ISSUER, clientId, audience, scopes, createdAt: now, expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    consumedAt: null
  });
  return { accessToken, refreshToken, expiresIn: 3600 };
}
