import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../database/migrations/20261107_win_odds_evidence.sql", import.meta.url), "utf8");

test("WIN odds schema retains pinned source, licence, timestamps and exact bookmaker selection", () => {
  for (const field of [
    "source_revision", "licence_id", "snapshot_role", "event_id", "market_id",
    "selection_id", "period", "bookmaker_id", "decimal_odds",
    "source_observed_at", "ingested_at", "event_start_at", "raw_payload"
  ]) assert.ok(sql.includes(field), `missing ${field}`);
});

test("WIN odds evidence is append-only and prediction decisions bind to exact quote IDs", () => {
  assert.ok(sql.includes("win_prediction_quote_bindings"));
  assert.ok(sql.includes("decision_quote_id text not null references public.win_odds_quote_snapshots"));
  assert.ok(sql.includes("win_reject_odds_evidence_mutation"));
  assert.ok(sql.includes("win_validate_prediction_quote_binding"));
  assert.ok(sql.includes("win_validate_clv_evaluation"));
  assert.ok(sql.includes("closing quote does not match decision evidence"));
  assert.ok(sql.includes("new.prediction_cutoff >= q.event_start_at"));
  assert.ok(sql.includes("c.event_start_at <> d.event_start_at"));
  assert.ok(sql.includes("new.odds_ratio_clv - (d.decimal_odds / c.decimal_odds - 1)"));
  assert.ok(sql.includes("new.implied_probability_delta - (1 / c.decimal_odds - 1 / d.decimal_odds)"));
  assert.ok(sql.includes("before update or delete on public.win_odds_quote_snapshots"));
  assert.ok(sql.includes("before update or delete on public.win_clv_evaluations"));
});

test("WIN CLV records remain evidence-only and cannot claim profitability", () => {
  assert.ok(sql.includes("evidence_only boolean not null default true check (evidence_only = true)"));
  assert.ok(sql.includes("profitability_claimed boolean not null default false check (profitability_claimed = false)"));
});

test("WIN quote schema constrains source revisions, price semantics and pre-match timestamps", () => {
  assert.ok(sql.includes("source_revision ~"));
  assert.ok(sql.includes("price_type = 'decimal_back'"));
  assert.ok(sql.includes("ingested_at >= source_observed_at"));
  assert.ok(sql.includes("source_observed_at < event_start_at and is_live = false"));
});
