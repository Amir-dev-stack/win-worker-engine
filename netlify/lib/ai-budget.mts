import { getStore } from "@netlify/blobs";

const STORE = () => getStore({ name: "win-engine", region: "eu-central-1", consistency: "strong" });
const LOCK_KEY = "ai-budget/controller-lock";
const LIMIT_USD = 3;
const OPERATING_LIMIT_USD = 2.95;
const WEB_SEARCH_USD = 0.01;
const SEARCH_CONTENT_TOKENS_PER_CALL = 8000;
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  "gpt-6.1-sol": { input: 2, output: 10 },
  "gpt-6-luna": { input: 0.1, output: 0.5 }
};

type Ledger = {
  month: string;
  limitUsd: number;
  spentUsd: number;
  reservations: Record<string, { amountUsd: number; createdAt: string; model: string; phase: string }>;
  calls: number;
  blockedCalls: number;
  lastCallAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}
function ledgerKey(month: string) {
  return "ai-budget/months/" + month;
}
function blankLedger(month: string): Ledger {
  return {
    month, limitUsd: LIMIT_USD, spentUsd: 0, reservations: {},
    calls: 0, blockedCalls: 0, lastCallAt: null, lastError: null,
    updatedAt: new Date().toISOString()
  };
}
function reservedTotal(ledger: Ledger) {
  return Object.values(ledger.reservations || {}).reduce((sum, item) => sum + Number(item.amountUsd || 0), 0);
}
function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

async function withControllerLock<T>(fn: () => Promise<T>): Promise<T> {
  const store = STORE();
  const owner = crypto.randomUUID();
  let acquired = false;

  for (let attempt = 0; attempt < 900; attempt++) {
    const current = await store.getWithMetadata(LOCK_KEY, { type: "json", consistency: "strong" }) as any;
    const now = Date.now();
    if (!current) {
      const result = await store.setJSON(LOCK_KEY, { owner, expiresAt: now + 120_000 }, { onlyIfNew: true });
      if (result.modified) { acquired = true; break; }
    } else if (Number(current.data?.expiresAt || 0) < now && current.etag) {
      const result = await store.setJSON(LOCK_KEY, { owner, expiresAt: now + 120_000 }, { onlyIfMatch: current.etag });
      if (result.modified) { acquired = true; break; }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!acquired) throw new Error("WIN AI budget controller is busy; request blocked safely.");
  try {
    return await fn();
  } finally {
    const current = await store.get(LOCK_KEY, { type: "json" }) as any;
    if (current?.owner === owner) await store.delete(LOCK_KEY);
  }
}

async function readLedger(month = monthKey()): Promise<Ledger> {
  const found = await STORE().get(ledgerKey(month), { type: "json" }) as Ledger | null;
  return found ? { ...blankLedger(month), ...found, reservations: found.reservations || {} } : blankLedger(month);
}
async function writeLedger(ledger: Ledger) {
  ledger.updatedAt = new Date().toISOString();
  await STORE().setJSON(ledgerKey(ledger.month), ledger);
}

export type AIRequestBudget = {
  id: string;
  model: string;
  phase: string;
  inputChars: number;
  maxOutputTokens: number;
  maxToolCalls: number;
  maxInputChars: number;
};

export async function reserveAIRequest(input: AIRequestBudget) {
  const rates = MODEL_RATES[input.model];
  if (!rates) return { allowed: false as const, reason: "No verified price policy exists for model " + input.model + "; AI call blocked." };
  if (input.inputChars > input.maxInputChars) {
    return { allowed: false as const, reason: "Request exceeds the WIN budget-safe input size (" + input.maxInputChars + " characters); shorten the brief or split the research." };
  }

  return withControllerLock(async () => {
    const month = monthKey();
    const ledger = await readLedger(month);
    const estimatedInputTokens = Math.ceil(input.inputChars * 3) + input.maxToolCalls * SEARCH_CONTENT_TOKENS_PER_CALL;
    const rawEstimate = (estimatedInputTokens * rates.input + input.maxOutputTokens * rates.output) / 1_000_000
      + input.maxToolCalls * WEB_SEARCH_USD + 0.005;
    const estimate = roundUsd(rawEstimate * 1.15);
    const reserved = reservedTotal(ledger);

    if (ledger.spentUsd + reserved + estimate > OPERATING_LIMIT_USD) {
      ledger.blockedCalls += 1;
      ledger.lastError = "Monthly WIN AI budget limit reached; request denied before calling OpenAI.";
      await writeLedger(ledger);
      return {
        allowed: false as const,
        reason: "WIN's $3 monthly API ceiling is protected. This request was blocked before it was sent to OpenAI."
      };
    }

    ledger.reservations[input.id] = {
      amountUsd: estimate, createdAt: new Date().toISOString(),
      model: input.model, phase: input.phase
    };
    await writeLedger(ledger);
    return { allowed: true as const, reservationId: input.id, reservedUsd: estimate, month };
  });
}

export async function settleAIRequest(
  reservationId: string,
  usage?: { input_tokens?: number; output_tokens?: number } | null,
  webSearchRequests = 0,
  uncertain = false
) {
  return withControllerLock(async () => {
    const month = monthKey();
    // Reservations are settled against the month in which they were created.
    const keys = [month, ...Array.from({ length: 2 }, (_, i) => {
      const date = new Date(); date.setUTCMonth(date.getUTCMonth() - (i + 1)); return monthKey(date);
    })];
    for (const key of keys) {
      const ledger = await readLedger(key);
      const reservation = ledger.reservations[reservationId];
      if (!reservation) continue;
      let charge = reservation.amountUsd;
      let source: "usage" | "reserved_estimate" = "reserved_estimate";
      if (!uncertain && usage && Number.isFinite(usage.input_tokens) && Number.isFinite(usage.output_tokens)) {
        const rates = MODEL_RATES[reservation.model];
        if (rates) {
          charge = roundUsd(((Number(usage.input_tokens) * rates.input + Number(usage.output_tokens) * rates.output) / 1_000_000
            + Math.max(0, webSearchRequests) * WEB_SEARCH_USD) * 1.05);
          source = "usage";
        }
      }
      delete ledger.reservations[reservationId];
      ledger.spentUsd = roundUsd(ledger.spentUsd + charge);
      ledger.calls += 1;
      ledger.lastCallAt = new Date().toISOString();
      ledger.lastError = null;
      (ledger as any).lastChargeSource = source;
      (ledger as any).lastChargeUsd = charge;
      await writeLedger(ledger);
      return { chargedUsd: charge, source, month: key };
    }
    return { chargedUsd: 0, source: "reservation_not_found" };
  });
}

export async function releaseAIRequest(reservationId: string, error?: string) {
  return withControllerLock(async () => {
    const month = monthKey();
    const ledger = await readLedger(month);
    if (ledger.reservations[reservationId]) delete ledger.reservations[reservationId];
    ledger.lastError = error || null;
    await writeLedger(ledger);
    return { released: true };
  });
}

export async function getAIbudgetStatus() {
  const ledger = await readLedger();
  const reservedUsd = roundUsd(reservedTotal(ledger));
  return {
    month: ledger.month,
    currency: "USD",
    monthlyLimitUsd: LIMIT_USD,
    operatingStopUsd: OPERATING_LIMIT_USD,
    spentUsd: roundUsd(ledger.spentUsd),
    reservedUsd,
    remainingUsd: roundUsd(Math.max(0, OPERATING_LIMIT_USD - ledger.spentUsd - reservedUsd)),
    calls: ledger.calls,
    blockedCalls: ledger.blockedCalls,
    lastCallAt: ledger.lastCallAt,
    lastError: ledger.lastError,
    enforcement: "application-level estimate only; NOT a provider hard cap or concurrency-safe financial ledger",
    note: "This Blobs ledger is advisory and must not be relied on as a guaranteed spending ceiling. Configure a provider-side monthly limit and usage alerts, disable auto-recharge, and reconcile actual usage in OpenAI Platform. AI execution is separately disabled unless WIN_AI_BUDGET_APPROVED=true."
  };
}
