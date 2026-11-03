import { requireAuth } from "../lib/auth.mts";

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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (body?.action !== "validate_api_key") {
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
