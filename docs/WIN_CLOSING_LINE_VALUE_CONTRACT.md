# WIN closing-line-value contract

Date: 2026-11-07  
Status: research-only evaluator and isolated tests added; no provider integration or live data claim.

## Why this is separate from consensus-market evaluation

The existing consensus-market dataset stores fair/consensus probabilities and does not consistently contain executable bookmaker prices. Consensus probability movement is not conventional bettor CLV. The new evaluator therefore accepts only explicit decimal back-price quotes and does not reinterpret fair probabilities as prices.

## Versioned quote evidence

```ts
type WinCLVQuote = {
  quoteId: string;
  sourceId: string;
  sourceRecordId: string;
  sourceRevision: string; // immutable 40-character source revision
  licenceId: string;
  snapshotRole: "decision" | "closing"; // source-declared, never inferred
  eventId: string;
  marketId: string;
  selectionId: string;
  period: string;
  line: string | number | null;
  bookmakerId: string;
  venueType: "sportsbook" | "exchange" | "prediction_market" | "unknown";
  priceType: "decimal_back";
  decimalOdds: number;
  sourceObservedAt: string;
  ingestedAt: string;
  eventStartAt: string;
  availabilityStatus: "open" | "suspended" | "closed" | "unknown";
  live: boolean;
};
```

The decision and closing observations must match exactly on source, event, market, selection, period, line, bookmaker, venue and price semantics. Both must be pre-kickoff, non-live, open and carry strict source timestamps. Decimal odds must be finite and greater than 1.

## Timing and leakage rules

- The source revision must be pinned and its licence ID retained; decision and closing snapshot roles must be explicitly declared by the source adapter, never inferred from which argument is passed.\n- Decision quote source time and ingestion time must both be at or before the prediction cutoff.
- Closing quote source time must be strictly after the prediction cutoff and before kickoff.
- Live mode additionally requires the closing quote to have been ingested before kickoff.
- Retrospective mode permits later ingestion of a historical close only when the source itself provides a valid pre-kickoff observation timestamp. This supports historical research; it does not claim the quote was available to WIN live at the time.
- Prediction-market prices and fair-probability-only inputs are excluded from this contract.
- Missing or mismatched evidence is rejected, not imputed.

## Reported measures

For decision decimal odds (O_d) and closing decimal odds (O_c):

- Odds-ratio CLV: (O_d / O_c - 1). Positive means the decision price was better than the closing price.
- Implied-probability delta: (1/O_c - 1/O_d). Positive means the closing price implies a higher probability than the probability paid for at decision time.

These measures are price comparisons, not realized return, expected value, profitability or proof of a predictive edge. Exchange commission, limits, liquidity, stake acceptance, voids and settlement rules require separate treatment.

## Current implementation boundary

Added:
- `netlify/lib/win-odds-clv.mts`: pure, fail-closed CLV evaluator.
- `scripts/win-odds-clv.test.mjs`: synthetic regression tests for identity, timestamps, availability, retrospective/live distinction and price semantics.
- Build and architecture-quality-gate registration.

Not yet implemented:
- A licensed historical or live provider adapter that produces this exact quote contract.
- A persistent immutable quote-snapshot registry and prediction-to-quote binding.
- A full market/selection catalogue mapping for all sports.
- Aggregated CLV reports with sample size, uncertainty intervals, bookmaker segmentation and selection/market stratification.
- Independent provider integration verification.

No live provider was called, no credentials or spending were enabled, no model was trained, and no betting or production route was changed. The PR remains draft until the user explicitly approves merge or production activation.


## Persistent evidence schema

`database/migrations/20261107_win_odds_evidence.sql` adds three append-only Neon/Postgres tables:

- `win_odds_quote_snapshots`: source-pinned, licensed, timestamped bookmaker quote records and raw payload.
- `win_prediction_quote_bindings`: immutable binding from each prediction to the exact decision-time quote, model artifact and feature snapshot.
- `win_clv_evaluations`: evidence-only CLV result records.

Database triggers reject updates/deletes and validate that the decision quote was open and ingested by the prediction cutoff. A closing quote must match the same event, market, selection, period, line, bookmaker, source revision, licence and venue; it must be observed after the cutoff and before kickoff. The database also independently checks the stored CLV arithmetic.

**Deployment boundary:** the migration has been applied and exercised on the isolated Neon branch `win-memory-schema-test` in project `win-memory`. It has not been applied to the `production` branch or any production database. Five database triggers were confirmed active. Synthetic tests verified a valid decision/closing quote flow, rejection of a mismatched bookmaker and a late decision quote, and rollback of all synthetic rows. Production application remains a separate approval step.


## Provider quote normalization boundary

Added `netlify/lib/win-odds-quote-normalizer.mts` as a strict adapter boundary. It does not fetch or invent data. A future provider connector must explicitly provide the source ID and record ID, pinned 40-character source revision, licence identifier, source-declared decision/closing role, event/market/selection/bookmaker identity, executable decimal back price, open status and source/ingestion/kickoff timestamps.

The normalizer rejects missing provenance, fair-probability and prediction-market inputs, unknown/suspended/closed availability, live or post-kickoff observations, invalid timestamps and invalid prices. When the provider does not supply its own quote ID, WIN derives a deterministic SHA-256 identity from the source record revision and quote identity/price fields. A source revision or price change therefore produces a different quote ID.

This is not a live or historical provider integration. It is a fail-closed contract that provider adapters must pass before any quote can be persisted or used for CLV. No provider credentials, external data calls, production migrations or deployment were added.
