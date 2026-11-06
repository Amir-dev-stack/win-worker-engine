import { requireAuth } from "../lib/auth.mts";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";
import { reserveAIRequest, settleAIRequest, releaseAIRequest } from "../lib/ai-budget.mts";
import { WIN_DEPARTMENTS } from "../lib/worker-org.mts";
import { list, put } from "../lib/store.mts";

const RESPONSE_URL = "https://api.openai.com/v1/responses";
const MAX_OUTPUT_TOKENS = 120;
const TIMEOUT_MS = 30_000;

function json(data: Record<string, unknown>, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" }
  });
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload?.output)) return "";
  return payload.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .filter((item: any) => item?.type === "output_text" && typeof item.text === "string")
    .map((item: any) => item.text)
    .join("\n")
    .slice(0, 1200);
}

function parseJson(text: string): any | null {
  try { return JSON.parse(text.trim()); } catch { return null; }
}

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;

  if (req.method === "GET") {
    const history = await list<any>("library/department-smoke-tests", 12);
    return json({ tests: history });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const parsedRequest = await readBoundedJsonObject(req, 8 * 1024);
  if (parsedRequest instanceof Response) return parsedRequest;
  const body = parsedRequest.body;

  if (body?.action !== "smoke_test" || typeof body?.departmentId !== "string") {
    return json({ error: "Provide action=smoke_test and a valid departmentId." }, 400);
  }

  const department = WIN_DEPARTMENTS.find(item => item.id === body.departmentId);
  if (!department) return json({ error: "Unknown WIN department." }, 400);

  const apiKey = Netlify.env.get("OPENAI_API_KEY")?.trim();
  const model = Netlify.env.get("OPENAI_MODEL")?.trim();
  if (!apiKey || !model) {
    return json({
      result: "not_configured",
      message: "OPENAI_API_KEY or OPENAI_MODEL is not available to this function.",
      inferencePerformed: false
    }, 503);
  }

  // This owner-only smoke test is the sole exception to the global inference
  // approval gate. It does not call the normal worker runner, enable schedules,
  // or change the global inference approval setting. The persistent budget stop still applies.
  const prompt = [
    "WIN DEPARTMENT ROUTING SMOKE TEST — NOT A SPORTS RESEARCH TASK.",
    "Department ID: " + department.id,
    "Department name: " + department.name,
    "Director: " + department.director,
    "Purpose: " + department.purpose,
    "Assigned team count: " + department.teams.length,
    "Assigned teams: " + department.teams.join("; "),
    "Confirm you received this department context. Do not browse, research events, assess bets, invent evidence, or make a recommendation.",
    "Return only a JSON object with exactly these fields:",
    '{"departmentId":"<the supplied ID>","departmentName":"<the supplied name>","assignedTeamCount":<the supplied integer>,"status":"SMOKE_TEST_PASSED","researchPerformed":false}'
  ].join("\n");

  const id = "department-smoke-" + crypto.randomUUID();
  const reservation = await reserveAIRequest({
    id,
    model,
    phase: "owner_department_routing_smoke_test",
    inputChars: prompt.length,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxToolCalls: 0,
    maxInputChars: 5000
  });

  if (!reservation.allowed) {
    return json({
      result: "blocked_by_budget",
      message: reservation.reason,
      inferencePerformed: false,
      budgetReservationCreated: false
    }, 403);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let ledgerCharge: { chargedUsd: number; source: string } | null = null;

  try {
    // One Responses API request, no tools, no retry, no stored response.
    const upstream = await fetch(RESPONSE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        tools: [],
        store: false
      }),
      cache: "no-store",
      signal: controller.signal
    });

    if (!upstream.ok) {
      const providerContentType = upstream.headers.get("content-type") || null;
      const providerRequestId = upstream.headers.get("x-request-id") || upstream.headers.get("request-id") || null;
      const providerRawBody = await upstream.text();
      let providerPayload: any = null;
      try { providerPayload = JSON.parse(providerRawBody); } catch { providerPayload = null; }
      const providerError = providerPayload?.error && typeof providerPayload.error === "object"
        ? providerPayload.error : providerPayload && typeof providerPayload === "object" ? providerPayload : {};
      const sanitizeProviderText = (value: string) => value
        .replaceAll(apiKey, "[REDACTED API KEY]")
        .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED API KEY]")
        .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
        .replace(/(authorization["']?\s*[:=]\s*["']?)([^"',\s}]+)/gi, "$1[REDACTED]")
        .replace(/\s+/g, " ")
        .slice(0, 320);
      const providerMessageRaw = typeof providerError.message === "string"
        ? providerError.message
        : typeof providerError.detail === "string" ? providerError.detail : null;
      const providerMessage = providerMessageRaw ? sanitizeProviderText(providerMessageRaw) : null;
      const providerResponseExcerpt = providerMessage ? null : providerRawBody ? sanitizeProviderText(providerRawBody) : null;
      const providerErrorCode = typeof providerError.code === "string" ? providerError.code.slice(0, 100) : null;
      const providerErrorType = typeof providerError.type === "string" ? providerError.type.slice(0, 100) : null;
      const providerErrorParam = typeof providerError.param === "string" ? providerError.param.slice(0, 100) : null;

      if (upstream.status >= 500) {
        const settled = await settleAIRequest(id, null, 0, true);
        ledgerCharge = { chargedUsd: settled.chargedUsd, source: settled.source };
      } else {
        await releaseAIRequest(id, "Department smoke test rejected by OpenAI with HTTP " + upstream.status);
      }
      const result = {
        id, departmentId: department.id, departmentName: department.name,
        result: "request_rejected", providerStatus: upstream.status,
        providerErrorCode, providerErrorType, providerErrorParam,
        providerErrorMessage: providerMessage, providerResponseExcerpt,
        providerContentType, providerRequestId,
        message: upstream.status === 401
          ? "OpenAI rejected the key during the Responses API request."
          : upstream.status === 403
            ? "OpenAI denied this model request. Check key endpoint permissions and model access."
            : upstream.status === 404
              ? "OpenAI could not resolve the configured model."
              : upstream.status === 429
                ? "OpenAI rate-limited the department smoke test."
                : upstream.status >= 500
                  ? "OpenAI returned a server error; the reserved estimate was retained because processing may be uncertain."
                  : "OpenAI rejected the department smoke test.",
        inferencePerformed: upstream.status >= 500 ? "uncertain" : false,
        chargedUsd: ledgerCharge?.chargedUsd ?? 0,
        chargeSource: ledgerCharge?.source ?? "reservation_released",
        createdAt: new Date().toISOString()
      };
      await put("library/department-smoke-tests", id, result);
      return json(result);
    }

    let payload: any;
    try { payload = await upstream.json(); } catch { payload = null; }
    const responseText = extractOutputText(payload);
    const parsed = parseJson(responseText);
    const usage = payload?.usage &&
      Number.isFinite(payload.usage.input_tokens) &&
      Number.isFinite(payload.usage.output_tokens)
      ? { input_tokens: payload.usage.input_tokens, output_tokens: payload.usage.output_tokens }
      : null;
    const settled = await settleAIRequest(id, usage, 0, !usage);
    ledgerCharge = { chargedUsd: settled.chargedUsd, source: settled.source };

    const passed = payload?.status === "completed" &&
      parsed?.departmentId === department.id &&
      parsed?.departmentName === department.name &&
      parsed?.assignedTeamCount === department.teams.length &&
      parsed?.status === "SMOKE_TEST_PASSED" &&
      parsed?.researchPerformed === false;

    const result = {
      id,
      departmentId: department.id,
      departmentName: department.name,
      director: department.director,
      result: passed ? "passed" : "response_format_failed",
      responseText: responseText.slice(0, 500),
      model: payload?.model || model,
      usage,
      chargedUsd: settled.chargedUsd,
      chargeSource: settled.source,
      inferencePerformed: true,
      researchPerformed: false,
      webToolsEnabled: false,
      normalAIExecutionEnabled: false,
      spendingApprovalChanged: false,
      createdAt: new Date().toISOString(),
      message: passed
        ? "Department context reached the configured model and the structured routing response passed validation. No sports research was performed."
        : "The model responded, but the department routing JSON did not pass validation. No sports research was performed."
    };
    await put("library/department-smoke-tests", id, result);
    return json(result);
  } catch {
    if (!ledgerCharge) {
      try {
        const settled = await settleAIRequest(id, null, 0, true);
        ledgerCharge = { chargedUsd: settled.chargedUsd, source: settled.source };
      } catch {
        // Keep any remaining reservation visible rather than assuming zero cost.
      }
    }
    const result = {
      id,
      departmentId: department.id,
      departmentName: department.name,
      result: controller.signal.aborted ? "timeout" : "network_error",
      inferencePerformed: "uncertain",
      chargedUsd: ledgerCharge?.chargedUsd ?? null,
      chargeSource: ledgerCharge?.source ?? "reservation_may_remain",
      researchPerformed: false,
      spendingApprovalChanged: false,
      createdAt: new Date().toISOString(),
      message: controller.signal.aborted
        ? "The diagnostic timed out. WIN retained or settled its reservation because provider processing may be uncertain."
        : "The diagnostic connection failed. WIN retained or settled its reservation because provider processing may be uncertain."
    };
    await put("library/department-smoke-tests", id, result);
    return json(result);
  } finally {
    clearTimeout(timeout);
  }
};

export const config = {
  path: "/api/department-smoke-test",
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 5 }
};
