import { getStore } from "@netlify/blobs";

const STORE = () => getStore({ name: "win-engine", region: "eu-central-1", consistency: "strong" });
const LOCK_KEY = "ai-budget/controller-lock";
const SETTINGS_KEY = "ai-budget/settings";
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
  alerts: BudgetAlert[];
  alertKeys: string[];
};

type BudgetAlert = {
  id: string;
  key: string;
  level: "info" | "warning" | "critical" | "limit_reached";
  message: string;
  createdAt: string;
  estimatedTotalUsd: number;
};

type BudgetSettings = { limitEnabled: true; spendingLocked: boolean; lockedAt: string | null; lockReason: string | null; lastOwnerApprovalAt: string | null; updatedAt: string | null };

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
    updatedAt: new Date().toISOString(), alerts: [], alertKeys: []
  };
}
function reservedTotal(ledger: Ledger) {
  return Object.values(ledger.reservations || {}).reduce((sum, item) => sum + Number(item.amountUsd || 0), 0);
}

function addBudgetAlert(
  ledger: Ledger,
  key: string,
  level: BudgetAlert["level"],
  message: string,
  estimatedTotalUsd: number
) {
  ledger.alertKeys = ledger.alertKeys || [];
  if (ledger.alertKeys.includes(key)) return;
  const alert: BudgetAlert = {
    id: crypto.randomUUID(), key, level, message,
    createdAt: new Date().toISOString(),
    estimatedTotalUsd: roundUsd(estimatedTotalUsd)
  };
  ledger.alerts = [alert, ...(ledger.alerts || [])].slice(0, 30);
  ledger.alertKeys = [...ledger.alertKeys, key].slice(-100);
}

function evaluateBudgetAlerts(ledger: Ledger, estimatedTotalUsd: number) {
  const amount = Math.max(0, estimatedTotalUsd);
  if (amount >= LIMIT_USD * 0.8) {
    addBudgetAlert(ledger, "threshold_80", "warning",
      "WIN AI estimated monthly usage has reached 80% of the $3 reference budget.", amount);
  }
  if (amount >= LIMIT_USD * 0.95) {
    addBudgetAlert(ledger, "threshold_95", "critical",
      "WIN AI estimated monthly usage has reached 95% of the $3 reference budget.", amount);
  }
  if (amount >= OPERATING_LIMIT_USD) {
    addBudgetAlert(ledger, "limit_reached", "limit_reached",
      "WIN AI usage has reached the $2.95 internal stop threshold. The application limit blocks new requests only while enforcement is enabled; OpenAI's own project or organisation limit remains separate.", amount);
  }
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
  return found ? {
    ...blankLedger(month), ...found,
    reservations: found.reservations || {},
    alerts: found.alerts || [],
    alertKeys: found.alertKeys || []
  } : blankLedger(month);
}

async function readBudgetSettings(): Promise<BudgetSettings> {
  const found = await STORE().get(SETTINGS_KEY, { type: "json" }) as Partial<BudgetSettings> | null;
  return {
    limitEnabled: true,
    spendingLocked: found?.spendingLocked === true,
    lockedAt: found?.lockedAt || null,
    lockReason: found?.lockReason || null,
    lastOwnerApprovalAt: found?.lastOwnerApprovalAt || null,
    updatedAt: found?.updatedAt || null
  };
}
async function lockSpending(reason: string) {
  const current = await readBudgetSettings();
  if (current.spendingLocked) return current;
  const next: BudgetSettings = { ...current, limitEnabled: true, spendingLocked: true,
    lockedAt: new Date().toISOString(), lockReason: reason, updatedAt: new Date().toISOString() };
  await STORE().setJSON(SETTINGS_KEY, next);
  return next;
}
export async function ownerApproveBudgetUnlock(confirmation: string) {
  if (confirmation !== "I AUTHORIZE WIN SPENDING UNLOCK") {
    throw new Error("Owner confirmation phrase did not match. Spending remains locked.");
  }
  return withControllerLock(async () => {
    const current = await readBudgetSettings();
    const now = new Date().toISOString();
    const next: BudgetSettings = { ...current, limitEnabled: true, spendingLocked: false,
      lockedAt: null, lockReason: null, lastOwnerApprovalAt: now,
      updatedAt: now };
    await STORE().setJSON(SETTINGS_KEY, next);
    const ledger = await readLedger();
    addBudgetAlert(ledger, "owner_unlock_" + Date.now(), "info",
      "Owner explicitly authorized WIN AI spending to resume. The monthly cap remains enabled.",
      ledger.spentUsd + reservedTotal(ledger));
    await writeLedger(ledger);
    return next;
  });
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
    const settings = await readBudgetSettings();
    const estimatedInputTokens = Math.ceil(input.inputChars * 3) + input.maxToolCalls * SEARCH_CONTENT_TOKENS_PER_CALL;
    const rawEstimate = (estimatedInputTokens * rates.input + input.maxOutputTokens * rates.output) / 1_000_000
      + input.maxToolCalls * WEB_SEARCH_USD + 0.005;
    const estimate = roundUsd(rawEstimate * 1.15);
    const reserved = reservedTotal(ledger);
    const projectedTotal = roundUsd(ledger.spentUsd + reserved + estimate);

    if (settings.spendingLocked) {
      ledger.blockedCalls += 1;
      ledger.lastError = "WIN AI spending is owner-locked; no request was sent to OpenAI.";
      await writeLedger(ledger);
      return { allowed: false as const, reason: "WIN AI spending is locked. Only the owner can explicitly authorize an unlock using the master internal token and confirmation phrase." };
    }

    if (projectedTotal >= OPERATING_LIMIT_USD) {
      await lockSpending("Monthly operating stop reached or projected. Owner approval is required to resume spending.");
      ledger.blockedCalls += 1;
      ledger.lastError = "Monthly WIN AI budget limit reached; request denied before calling OpenAI.";
      evaluateBudgetAlerts(ledger, Math.max(projectedTotal, OPERATING_LIMIT_USD));
      await writeLedger(ledger);
      return {
        allowed: false as const,
        reason: "WIN has reached its $2.95 monthly operating stop and is now locked. This request was blocked before it was sent to OpenAI. Only the owner can unlock it."
      };
    }

    ledger.reservations[input.id] = {
      amountUsd: estimate, createdAt: new Date().toISOString(),
      model: input.model, phase: input.phase
    };
    evaluateBudgetAlerts(ledger, projectedTotal);
    await writeLedger(ledger);
    return {
      allowed: true as const, reservationId: input.id, reservedUsd: estimate, month,
      limitEnabled: settings.limitEnabled
    };
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
      const settledTotal = ledger.spentUsd + reservedTotal(ledger);
      evaluateBudgetAlerts(ledger, settledTotal);
      if (settledTotal >= OPERATING_LIMIT_USD) await lockSpending("Settled monthly usage reached the $2.95 operating stop. Owner approval is required to resume spending.");
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
  const [ledger, settings] = await Promise.all([readLedger(), readBudgetSettings()]);
  const reservedUsd = roundUsd(reservedTotal(ledger));
  const totalTrackedUsd = roundUsd(ledger.spentUsd + reservedUsd);
  return {
    month: ledger.month,
    currency: "USD",
    monthlyLimitUsd: LIMIT_USD,
    operatingStopUsd: OPERATING_LIMIT_USD,
    limitEnabled: true,
    limitUpdatedAt: settings.updatedAt,
    limitMode: settings.spendingLocked ? "owner_locked" : "enforced",
    spendingLocked: settings.spendingLocked,
    lockedAt: settings.lockedAt,
    lockReason: settings.lockReason,
    lastOwnerApprovalAt: settings.lastOwnerApprovalAt,
    spentUsd: roundUsd(ledger.spentUsd),
    reservedUsd,
    totalTrackedUsd,
    remainingUsd: roundUsd(Math.max(0, OPERATING_LIMIT_USD - totalTrackedUsd)),
    calls: ledger.calls,
    blockedCalls: ledger.blockedCalls,
    lastCallAt: ledger.lastCallAt,
    lastError: ledger.lastError,
    alerts: (ledger.alerts || []).slice(0, 20),
    enforcement: "application-level estimated stop with a persistent owner lock; NOT a provider hard cap or a guarantee against provider-side billing overshoot",
    note: "The owner lock persists across calendar-month rollover. No agent, OAuth client, scheduled task or ordinary API request can unlock it. Unlock requires the WIN_INTERNAL_TOKEN and exact owner confirmation phrase. OpenAI provider-side spending limits remain separate."
  };
}
