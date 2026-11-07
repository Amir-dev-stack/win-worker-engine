const MAX_OAUTH_BODY_BYTES = 16 * 1024;

function badRequest(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

async function readBoundedOAuthText(req: Request, expectedType: string, maxBytes: number): Promise<string | Response> {
  const mediaType = req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== expectedType) return badRequest("unsupported_media_type", 415);
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return badRequest("request_body_too_large", 413);
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (req.body) {
    const reader = req.body.getReader();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        totalBytes += part.value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          return badRequest("request_body_too_large", 413);
        }
        chunks.push(part.value);
      }
    } catch {
      return badRequest("request_body_unreadable", 400);
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return badRequest("request_body_invalid_utf8", 400); }
}

export async function readOAuthFormBody(req: Request, maxBytes = MAX_OAUTH_BODY_BYTES): Promise<{ params: URLSearchParams } | Response> {
  const raw = await readBoundedOAuthText(req, "application/x-www-form-urlencoded", maxBytes);
  if (raw instanceof Response) return raw;
  const params = new URLSearchParams(raw);
  const seen = new Set<string>();
  let count = 0;
  for (const [key, value] of params) {
    count++;
    if (!key || key.length > 100 || value.length > 8192 || seen.has(key) || count > 32) {
      return badRequest("invalid_form_parameters", 400);
    }
    seen.add(key);
  }
  return { params };
}

export async function readOAuthJsonBody(req: Request, maxBytes = MAX_OAUTH_BODY_BYTES): Promise<{ body: Record<string, any> } | Response> {
  const raw = await readBoundedOAuthText(req, "application/json", maxBytes);
  if (raw instanceof Response) return raw;
  let body: any;
  try { body = JSON.parse(raw); }
  catch { return badRequest("invalid_json", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest("json_object_required", 400);
  return { body };
}
