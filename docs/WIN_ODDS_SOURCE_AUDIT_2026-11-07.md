# WIN odds-source audit — football consensus market records

Date: 2026-11-07  
Branch: `docs/win-staged-build-roadmap`  
Scope: read-only inspection of the current consensus-market adapter and market-evaluation contract.

## Finding

The current football historical consensus adapter provides useful research data, but it does **not** provide enough information to calculate conventional bettor closing-line value (CLV).

The inspected adapter is `netlify/lib/consensus-market-adapter.mts`. It normalizes:
- Opening HOME/DRAW/AWAY consensus probabilities from source fields such as `open_home_win_prob`, `open_home_prob`, `open_draw_prob`, and `open_away_prob`.
- Closing consensus probabilities from corresponding `close_*` probability fields.
- A closing market snapshot timestamp only when an explicit valid source timestamp exists.
- Fair closing odds fields and selected settlement outcomes.
- A provider dataset revision, raw checksum, normalized-record checksum, retrieval time and source attribution.

The imported dataset explicitly declares:
- `priceType: "consensus_fair_probabilities"` for football.
- `bookmakerIdentityIncluded: false`.
- `bestPriceAvailable: false` for football.
- `bestPriceBookmakerIdentityIncluded: false`.

The adapter does not currently persist a source opening timestamp or a time-stamped price available at WIN's actual prediction/decision time. The market evaluation registry binds the closing consensus probability vector to its source record and closing snapshot timestamp, but evaluates Brier score, log loss and expected calibration error—not bettor CLV.

## What can and cannot be claimed

Can be evaluated with eligible source rows:
- Opening-to-closing consensus probability movement, when both source probability fields are present.
- Closing consensus probability as a market benchmark, subject to source methodology and coverage.
- Model-vs-closing-market Brier score/log loss on the exact same registered held-out events and prediction cutoffs.
- Calibration and chronological predictive performance.

Cannot currently be claimed from this dataset alone:
- Conventional CLV based on the price actually available when a recommendation was made versus the closing price.
- Best-price CLV or bookmaker-specific CLV.
- Executable payout/return or ROI at a real bookmaker.
- A guarantee that the consensus fair probability corresponds to a price WIN could have obtained.

Do not relabel consensus probability movement as CLV. Do not derive a fictional decision-time price from the opening or closing fields.

## Required data contract for genuine CLV

A future source/adapter must preserve, per event, market, selection, line and (where applicable) bookmaker:
1. Source/provider identity, licence, source revision and immutable source-record ID.
2. Exact market and selection identity, including period, line/handicap and settlement convention.
3. Raw decimal price, not only a fair probability.
4. Source timestamp for opening, decision-time quote and closing quote, with timestamp precision and retrieval time stored separately.
5. Bookmaker identity or an explicit documented consensus-price method.
6. Market suspension/availability and stale-quote status.
7. Overround and versioned de-vig method for probability comparisons.
8. Prediction ID and decision cutoff binding the quote that was genuinely available at that time.

CLV should be computed only for comparable quotes and explicit price semantics. Missing decision-time or closing price means CLV is unavailable for that observation.

## Recommended next steps

1. Keep the existing consensus dataset and evaluation contract immutable.
2. Audit any candidate historical odds sources for raw prices, opening/closing timestamps, bookmaker coverage, licence and commercial-use permissions before adding them.
3. Add a backward-compatible versioned odds-quote schema and isolated fixtures covering missing timestamps, mismatched event/market/selection identities, stale quotes, bookmaker mismatch, price/overround validation and duplicate snapshots.
4. Add a separate CLV evaluator only after an approved source can bind real decision-time and closing prices to the same selections.
5. Continue using the current consensus probabilities for market-benchmark scoring where their source timestamp and cohort binding pass validation; label the benchmark accurately.

This is a source-schema audit, not a live-provider test, dataset import, model evaluation or profitability result. No production data, secrets, provider calls, deployments or betting activity were changed.
