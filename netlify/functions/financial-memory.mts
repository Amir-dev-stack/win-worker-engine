import { requireAuth } from "../lib/auth.mts";
import { getMemoryBackendMode } from "../lib/store.mts";
import { getNeonStore } from "../lib/neon-store.mts";

const ENTRY_TYPES = new Set(["deposit", "withdrawal", "exposure_open", "exposure_close", "realized_pnl", "adjustment"]);
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";

function ready() {
  return getMemoryBackendMode() !== "blobs" && Boolean(process.env.WIN_NEON_DATABASE_URL?.trim());
}

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!ready()) return Response.json({ error: "Enable the Neon mirror and apply the financial-memory migration first." }, { status: 503 });

  const db = getNeonStore();
  if (req.method === "GET") {
    const url = new URL(req.url);
    const accountId = text(url.searchParams.get("accountId"));
    if (!accountId) return Response.json({ error: "accountId is required." }, { status: 400 });
    const account = await db.getFinancialAccount(accountId);
    return account
      ? Response.json({ account }, { headers: { "cache-control": "no-store" } })
      : Response.json({ error: "Financial account not found." }, { status: 404 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: "Expected JSON body" }, { status: 400 }); }

  try {
    if (body?.action === "create_account") {
      const accountId = text(body.accountId);
      const currency = text(body.currency, 3).toUpperCase();
      const openingBalance = body.openingBalance;
      const maxTotalExposure = body.maxTotalExposure;
      const maxSingleExposure = body.maxSingleExposure;
      const dailyLossLimit = body.dailyLossLimit;
      if (!/^[a-zA-Z0-9_-]{3,80}$/.test(accountId) || !/^[A-Z]{3}$/.test(currency) ||
          !finite(openingBalance) || openingBalance < 0 ||
          !finite(maxTotalExposure) || maxTotalExposure <= 0 ||
          !finite(maxSingleExposure) || maxSingleExposure <= 0 || maxSingleExposure > maxTotalExposure ||
          !finite(dailyLossLimit) || dailyLossLimit <= 0) {
        return Response.json({ error: "Provide a valid accountId, ISO currency code, nonnegative opening balance and positive exposure/loss limits." }, { status: 400 });
      }
      const account = await db.createFinancialAccount({
        accountId, currency, openingBalance, maxTotalExposure, maxSingleExposure, dailyLossLimit
      });
      return Response.json({ account, message: "Financial memory account created. WIN did not place any bet." }, { status: 201 });
    }

    if (body?.action === "record_entry") {
      const accountId = text(body.accountId);
      const idempotencyKey = text(body.idempotencyKey);
      const entryType = text(body.entryType, 40);
      const amount = body.amount;
      const exposureDelta = body.exposureDelta;
      const referenceId = text(body.referenceId, 180) || null;
      const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};
      if (!accountId || !idempotencyKey || !ENTRY_TYPES.has(entryType) ||
          !finite(amount) || !finite(exposureDelta) || JSON.stringify(metadata).length > 10_000) {
        return Response.json({ error: "Provide accountId, idempotencyKey, a supported entryType and finite amount/exposureDelta values." }, { status: 400 });
      }
      const result = await db.recordFinancialEntry({
        accountId, idempotencyKey, entryType, amount, exposureDelta, referenceId, metadata
      });
      return Response.json({ result, message: result?.accepted ? "Financial entry recorded." : "Financial entry rejected by account or risk limits." }, {
        status: result?.accepted ? 200 : 409,
        headers: { "cache-control": "no-store" }
      });
    }

    return Response.json({ error: "Unknown action", allowedActions: ["create_account", "record_entry"] }, { status: 400 });
  } catch (error) {
    return Response.json({ error: String(error).slice(0, 500) }, { status: 400 });
  }
};

export const config = { path: "/api/financial-memory" };
