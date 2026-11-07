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


## Follow-up implementation update — 2026-11-07

The following research-only foundations have now been added on the same branch:

- `netlify/lib/win-odds-clv.mts` defines `win.odds.clv.v1` and calculates price-based CLV only from a source-declared decision quote and source-declared closing quote.
- The two quotes must match on source, pinned source revision, licence ID, event, market, selection, period, line, bookmaker, venue and decimal-back-price semantics.
- Both quotes must be source-timestamped, open, pre-kickoff and non-live. The decision quote must also have been ingested by the prediction cutoff.
- Live and retrospective modes are distinct. Retrospective backfills do not claim that WIN itself possessed the quote live.
- Synthetic tests and build/quality-gate registration were added.

### Existing observed-price sample importer

The repository also contains `netlify/lib/sharpapi-sample-adapter.mts`. It imports static CC BY 4.0 sample CSVs and preserves decimal odds, a bookmaker label, event/market/selection fields and source observation timestamp. However:
- Its source URL points to the mutable GitHub `main` branch rather than a pinned commit revision.
- Availability status is set to `unknown`.
- The files are static sample snapshots, not a verified continuously captured opening-to-closing bookmaker history.
- The importer does not establish that the quoted bookmaker price was executable or that WIN could access it at a historical decision time.

Therefore this sample importer is useful for testing data-shape handling and quality diagnostics, but it is **not** currently approved evidence for live CLV, historical CLV claims, ROI or provider performance.

### Remaining integration work

1. Find and review a source whose licence permits the intended use and whose historical snapshots include stable source revision, bookmaker, market/selection/line, raw decimal prices and explicit source timestamps.
2. Add an immutable quote registry that binds each source record and quote to its licence/revision and each WIN prediction to the decision-time quote.
3. Add an explicit source-declared closing snapshot marker and ensure the adapter selects the true market close, not an arbitrary late quote.
4. Aggregate matched CLV observations by sport, league, market, bookmaker and time horizon, with sample counts and uncertainty intervals.
5. Verify the full workflow on real licensed data before claiming CLV performance.

The evaluator is not wired to a production route or automated betting. No provider was activated and no real-world CLV result is claimed.


## Provider and zero-cost feasibility review — 2026-11-07

This is a documentation-only review of official public pricing, API documentation and terms. No account was created, no key was requested, and no provider endpoint was called.

### Candidate A — The Odds API

Official pages:
- Pricing and free tier: https://the-odds-api.com/
- Historical odds: https://the-odds-api.com/historical-odds-data/
- API terms (updated 2026-08-31): https://the-odds-api.com/terms-and-conditions.html
- V4 docs: https://the-odds-api.com/liveapi/guides/v4/

Findings:
- The published free Starter tier is 500 credits/month and includes current sports odds.
- Historical odds endpoints are explicitly paid-plan-only. Historical featured markets are available from 2020 with snapshots at 10-minute intervals initially and 5-minute intervals from September 2022; additional markets have their own later coverage.
- The provider terms explicitly permit storage/retention and use in statistical or ML model training, and permit dashboards/apps where the raw data is not resold as a standalone data product.
- The API returns bookmaker identity and bookmaker/market update timestamps. For historical endpoints it also returns the requested snapshot timestamp and neighboring snapshot timestamps.

Assessment:
- Best candidate for a controlled, zero-cost *forward collection pilot* if one sport/competition, one market, one region and a low polling cadence fit within 500 monthly credits.
- Not a free source for retrospective multi-season CLV. Historical backfill must remain disabled unless a paid plan is separately approved.
- The free plan quota and actual event/region/market coverage must be confirmed in the account before any scheduled collector is enabled.
- The collector must persist every poll as an observation and must not pretend that the most recently seen price is necessarily the bookmaker's true closing price. A close label requires a documented end-of-market selection rule and timestamp evidence.

### Candidate B — API-FOOTBALL (API-SPORTS)

Official pages:
- Pricing: https://www.api-football.com/pricing
- Terms: https://www.api-football.com/terms
- Documentation: https://www.api-football.com/documentation-v3

Findings:
- The public Free plan advertises 100 requests/day and includes pre-match and in-play odds, with free access limited by available seasons.
- The terms prohibit resale of raw data and explicitly warn that the service does not grant commercial rights for third-party competitions or a licence to publish the data in applications/products. The user is responsible for obtaining any additional rights needed for publication or betting-platform use.
- Its documented pre-match odds are updated on a slower cadence than a high-frequency price feed; coverage and data availability vary by competition.

Assessment:
- Potentially useful as a limited football fixture/context/odds source for private experimentation after the exact intended use and competition rights are reviewed.
- Not approved for public display, resale or commercial distribution based only on the free subscription.
- The published free quota is not a substitute for a historical timestamped odds archive. WIN must not assume it supplies a deep historical opening-to-close price series.

### Candidate C — Sportmonks

Official pages:
- Pricing: https://www.sportmonks.com/football-api/plans-pricing/
- FAQ: https://www.sportmonks.com/faq/

Findings:
- The published football Starter plan begins at €29/month; odds bundles and premium odds feeds are separately priced.
- Sportmonks documents opening odds and subsequent odds changes, but the published FAQ describes odds history availability around the fixture and does not make this a zero-cost historical archive.

Assessment:
- Technically interesting for later paid evaluation, but not a $0-first provider. Do not activate or trial with payment details.

### Decision

1. **No provider is activated by this review.**
2. The Odds API is the leading candidate for a narrow free forward-collection experiment because its published terms explicitly permit retained data and ML training, while historical backfill is paid-only.
3. Keep API-FOOTBALL as a secondary candidate only for private, narrow football coverage after rights and publication restrictions are resolved.
4. Do not use Sportmonks in the current zero-cost stage.
5. Before implementation, require an owner-reviewed provider record: exact API plan, permitted use, data domains, attribution, retention, redistribution/display rights, competition restrictions, quota and source timestamp semantics.
6. Start with one football competition and one market only after an actual key and quota are available. Poll at a quota-safe interval, store immutable raw responses and normalized bookmaker quotes, and track missing polls. Do not claim CLV until both decision and true pre-kickoff close prices are independently reconstructable.
