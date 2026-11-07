const MAX_INDEPENDENT_REVIEW_BODY_BYTES = 64 * 1024;

export async function readIndependentReviewBody(req: Request): Promise<{ body: Record<string, any> } | Response> {
  const mediaType = req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") return Response.json({ error: "application_json_required" }, { status: 415, headers: { "cache-control": "no-store" } });
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INDEPENDENT_REVIEW_BODY_BYTES) return Response.json({ error: "request_body_too_large" }, { status: 413, headers: { "cache-control": "no-store" } });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (req.body) {
    const reader = req.body.getReader();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        totalBytes += part.value.byteLength;
        if (totalBytes > MAX_INDEPENDENT_REVIEW_BODY_BYTES) {
          await reader.cancel();
          return Response.json({ error: "request_body_too_large" }, { status: 413, headers: { "cache-control": "no-store" } });
        }
        chunks.push(part.value);
      }
    } catch {
      return Response.json({ error: "request_body_unreadable" }, { status: 400, headers: { "cache-control": "no-store" } });
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let raw: string;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return Response.json({ error: "request_body_invalid_utf8" }, { status: 400, headers: { "cache-control": "no-store" } }); }
  let body: any;
  try { body = JSON.parse(raw); }
  catch { return Response.json({ error: "invalid_json" }, { status: 400, headers: { "cache-control": "no-store" } }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "json_object_required" }, { status: 400, headers: { "cache-control": "no-store" } });
  return { body };
}
