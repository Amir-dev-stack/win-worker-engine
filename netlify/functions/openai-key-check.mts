import { requireAuth } from "../lib/auth.mts";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";
import { reserveAIRequest, settleAIRequest, releaseAIRequest } from "../lib/ai-budget.mts";

const MODELS_URL = "https://api.openai.com/v1/models";
const TIMEOUT_MS = 10_000;

function json(data: Record<string, unknown>, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" }
  });
}

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const parsedRequest = await readBoundedJsonObject(req, 8 * 1024);
  if (parsedRequest instanceof Response) return parsedRequest;
  const body = parsedRequest.body;

  if (!["validate_api_key", "validate_model_response"].includes(body?.action)) {
    return json({ error: "Unsupported diagnostic action." }, 400);
  }

  const apiKey = Netlify.env.get("OPENAI_API_KEY")?.trim();
  const configuredModel = Netlify.env.get("OPENAI_MODEL")?.trim() || "";

  if (!apiKey) {
    return json({
      result: "not_configured",
      authentication: "not_checked",
      message: "OPENAI_API_KEY is not available to this function.",
      inferencePerformed: false,
      spendingApprovalChanged: false
    });
  }

  if (body.action === "validate_model_response") {
    if (!configuredModel) {
      return json({ result: "not_configured", message: "OPENAI_MODEL is not configured.", inferencePerformed: false, spendingApprovalChanged: false });
    }

    // One owner-authorized diagnostic call only. Normal WIN agents, schedules,
    // and the global AI approval flag remain unchanged.
    const prompt = "Reply with exactly this token and nothing else: WIN_OK";
    const reservationId = "owner-model-diagnostic-" + crypto.randomUUID();
    const reservation = await reserveAIRequest({
      id: reservationId,
      model: configuredModel,
      phase: "owner_minimal_model_diagnostic",
      inputChars: prompt.length,
      maxOutputTokens: 16,
      maxToolCalls: 0,
      maxInputChars: 1000
    });

    if (!reservation.allowed) {
      return json({
        result: "blocked_by_budget",
        message: reservation.reason,
        inferencePerformed: false,
        spendingApprovalChanged: false
      }, 403);
    }

    const controller = new AbortController();
    const responseTimeout = setTimeout(() => controller.abort(), 30_000);

    try {
      // Exactly one Responses API request; no tools, no retry, no stored response.
      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          model: configuredModel,
          input: prompt,
          max_output_tokens: 16,
          tools: [],
          store: false
        }),
        cache: "no-store",
        signal: controller.signal
      });

      if (!upstream.ok) {
        if (upstream.status >= 500) {
          const settled = await settleAIRequest(reservationId, null, 0, true);
          return json({
            result: "provider_error",
            providerStatus: upstream.status,
            message: "OpenAI returned a server error. WIN retained the small reserved estimate because processing may be uncertain.",
            chargedUsd: settled.chargedUsd,
            chargeSource: settled.source,
            inferencePerformed: "uncertain",
            spendingApprovalChanged: false
          });
        }

        await releaseAIRequest(reservationId, "Owner diagnostic rejected by OpenAI with HTTP " + upstream.status);
        const message = upstream.status === 401
          ? "OpenAI rejected the API key during the model-response request."
          : upstream.status === 403
            ? "OpenAI denied this model request. Check model or project permissions."
            : upstream.status === 404
              ? "OpenAI could not resolve the configured model for Responses API."
              : upstream.status === 429
                ? "OpenAI rate-limited the model-response test. No model response was generated."
                : "OpenAI rejected the minimal model-response request.";
        return json({
          result: "request_rejected",
          providerStatus: upstream.status,
          message,
          inferencePerformed: false,
          spendingApprovalChanged: false
        });
      }

      let payload: any;
      try {
        payload = await upstream.json();
      } catch {
        payload = null;
      }

      if (!payload || typeof payload !== "object") {
        const settled = await settleAIRequest(reservationId, null, 0, true);
        return json({
          result: "unexpected_response",
          message: "OpenAI accepted the request but returned an unreadable response. WIN retained the small reserved estimate.",
          chargedUsd: settled.chargedUsd,
          chargeSource: settled.source,
          inferencePerformed: "uncertain",
          spendingApprovalChanged: false
        });
      }

      const usage = payload.usage && Number.isFinite(payload.usage.input_tokens) && Number.isFinite(payload.usage.output_tokens)
        ? { input_tokens: payload.usage.input_tokens, output_tokens: payload.usage.output_tokens }
        : null;
      const settled = await settleAIRequest(reservationId, usage, 0, !usage);
      const responseText = Array.isArray(payload.output)
        ? payload.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
            .filter((item: any) => item?.type === "output_text" && typeof item.text === "string")
            .map((item: any) => item.text)
            .join("")
            .slice(0, 120)
        : "";

      return json({
        result: payload.status === "completed" && responseText ? "response_received" : "incomplete_response",
        model: payload.model || configuredModel,
        responseText,
        responseStatus: payload.status || "unknown",
        usage,
        chargedUsd: settled.chargedUsd,
        chargeSource: settled.source,
        inferencePerformed: true,
        spendingApprovalChanged: false,
        normalAIExecutionEnabled: false,
        message: payload.status === "completed" && responseText
          ? "WIN received a real model response. Only this single diagnostic request was executed."
          : "OpenAI processed the request, but WIN did not receive a complete text response."
      });
    } catch {
      const settled = await settleAIRequest(reservationId, null, 0, true);
      return json({
        result: controller.signal.aborted ? "timeout" : "network_error",
        message: controller.signal.aborted
          ? "The model-response test timed out. WIN retained the small reserved estimate because provider processing may be uncertain."
          : "The connection failed after the diagnostic request started. WIN retained the small reserved estimate because provider processing may be uncertain.",
        chargedUsd: settled.chargedUsd,
        chargeSource: settled.source,
        inferencePerformed: "uncertain",
        spendingApprovalChanged: false
      });
    } finally {
      clearTimeout(responseTimeout);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Read-only model-catalog request: no prompt, generation, or WIN budget-ledger access.
    const upstream = await fetch(MODELS_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      },
      cache: "no-store",
      signal: controller.signal
    });

    if (upstream.status === 401) {
      return json({
        result: "rejected",
        authentication: "rejected",
        providerStatus: 401,
        message: "OpenAI rejected the configured credential. Check that the production key is current and has not been revoked.",
        inferencePerformed: false,
        spendingApprovalChanged: false
      });
    }

    if (upstream.status === 403) {
      return json({
        result: "inconclusive",
        authentication: "not_confirmed",
        providerStatus: 403,
        message: "OpenAI denied model-catalog access. The key may be restricted or blocked by project or organization policy; this does not by itself prove the key is invalid.",
        inferencePerformed: false,
        spendingApprovalChanged: false
      });
    }

    if (upstream.status === 429) {
      return json({
        result: "inconclusive",
        authentication: "not_confirmed",
        providerStatus: 429,
        message: "OpenAI rate-limited the diagnostic. Retry later; no model inference was requested.",
        inferencePerformed: false,
        spendingApprovalChanged: false
      });
    }

    if (!upstream.ok) {
      return json({
        result: "provider_error",
        authentication: "not_confirmed",
        providerStatus: upstream.status,
        message: "OpenAI returned an unexpected error while checking the model catalog.",
        inferencePerformed: false,
        spendingApprovalChanged: false
      });
    }

    let payload: any;
    try {
      payload = await upstream.json();
    } catch {
      payload = null;
    }

    if (!Array.isArray(payload?.data)) {
      return json({
        result: "unexpected_response",
        authentication: "not_confirmed",
        message: "OpenAI responded, but the model-catalog response had an unexpected format.",
        inferencePerformed: false,
        spendingApprovalChanged: false
      });
    }

    const configuredModelListed = configuredModel
      ? payload.data.some((model: any) => model?.id === configuredModel)
      : null;

    return json({
      result: "passed",
      authentication: "valid",
      configuredModelListed,
      checkedAt: new Date().toISOString(),
      inferencePerformed: false,
      spendingApprovalChanged: false,
      message: configuredModel
        ? (configuredModelListed
          ? "OpenAI accepted the API key and the configured model appears in the available model list."
          : "OpenAI accepted the API key, but the configured model was not present in the available model list.")
        : "OpenAI accepted the API key. OPENAI_MODEL is not configured."
    });
  } catch {
    return json({
      result: controller.signal.aborted ? "timeout" : "network_error",
      authentication: "not_confirmed",
      message: controller.signal.aborted
        ? "The OpenAI model-catalog check timed out."
        : "WIN could not reach the OpenAI model-catalog endpoint.",
      inferencePerformed: false,
      spendingApprovalChanged: false
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const config = { path: "/api/openai-key-check" };
