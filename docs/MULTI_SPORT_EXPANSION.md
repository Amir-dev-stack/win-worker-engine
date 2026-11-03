# WIN Multi-Sport Expansion Blueprint

## Product scope
WIN is a multi-sport, multi-market research, simulation and audit platform. It is not limited to football or to one bookmaker's current catalogue. The sport registry is extensible: a new sport or discipline is added through a capability adapter rather than changing coupon logic.

## Coverage domains
- Sports and disciplines: football, basketball, tennis, ice hockey, baseball, American football, rugby, cricket, volleyball, handball, boxing/MMA, motorsport, golf, darts, snooker, table tennis, badminton, esports, cycling, water sports, athletics, and any additional sport discovered in a supported bookmaker offer.
- Hierarchy: global -> sport -> country/region -> governing body -> league/tour/competition -> season -> event -> team/club/pair -> athlete/player -> manager/coach -> specialist market agents.
- Every identity is persistent in the library and activated on demand. Do not pre-create millions of empty profiles; discover entities from verified schedules, offers, user input and trusted sources, then create/update their persistent profiles.
- Coaches/managers are first-class entities, not merely text fields on team records.

## Coupon laboratory
1. Single-event / Bet Builder: enumerate only combinations that are actually offered or historically observed, retain the bookmaker's combined price, market restrictions, correlation and settlement rules. Never multiply individual leg odds to invent a same-game price.
2. Multi-event single-sport: build combinations across distinct events in one sport.
3. Mixed-sport: combine eligible events across sports, with each leg validated by its sport adapter and the market/settlement adapter.
4. System / round-robin / MAXIKOMBI: model the exact system structure and partial-return rules separately from ordinary accumulators.
5. Human coupon research: store only public or user-supplied coupons with source URL, captured timestamp, screenshot/text evidence, bookmaker, displayed price, and identity/attribution confidence. Never bypass login, paywalls, or access controls.

## Simulation and learning
- Separate simulation, historical_backtest, paper_prediction, real_coupon, and human_coupon records.
- Keep winning, losing, void/partial/cancelled and pending ledgers separate.
- Every pre-event forecast must be frozen before the event starts; later corrections append new versions and never overwrite the original forecast.
- Require event-time odds snapshots and independently evidenced results. Same-event Bet Builder combos require a real combined price and exact combo settlement evidence.
- Report ROI, yield, hit rate, calibration, Brier/log loss where probabilities exist, closing-line movement where available, drawdown, sample size, confidence intervals, market/competition splits and data coverage.
- Randomly recombining already-settled picks is descriptive only. It is not a predictive backtest and cannot validate an edge.
- Split training and evaluation chronologically; use rolling/forward validation, leakage checks, minimum sample gates and strategy versioning. A lesson stays candidate_for_validation until replicated out-of-sample.
- Attribute a loss to a leg or causal factor only when evidence supports attribution; otherwise record an unattributed outcome observation.

## Research library schema
Archive normalized records for fixtures, schedules, results, H2H, standings, rosters, lineups, injuries, suspensions, transfers, manager changes, tactics, player/team statistics, venue/surface, weather, rest/travel, market catalogues, prices/line movement, rules and settlement evidence. Every record carries entity/event IDs, sport/competition scope, source URL/provider, publication time, retrieval time, valid-time window, freshness TTL, evidence grade, confidence, raw snapshot hash and conflict status.

## Governance and reliability
- A data-source registry declares terms/permissions, rate limits, coverage, attribution, retention, reliability and cost.
- Deduplicate by provider IDs plus normalized identities; retain aliases and provenance.
- A source conflict queue prevents silent overwrites.
- A freshness scheduler refreshes volatile fields (prices, lineups, injuries, event status) close to start time and slowly changing fields on longer intervals.
- A coverage dashboard lists missing data by sport/competition/market. Unknown is not zero.
- A responsible-play gate blocks claims of certainty, guarantees, loss-chasing, or forced minimum odds.
- Cost governor enforces monthly caps, per-provider quotas, request budgets and kill switches. Do not promise always-on coverage without an active scheduler, provider entitlement and budget.

## Implementation status note
The registry and manager identity support are the first code slice. The existing historical simulator can sample selections from different sports when the input dataset contains multiple sports; this is not the same as a fully validated mixed-sport predictive model. Full same-event Bet Builder generation, source ingestion adapters, normalized event-stat storage, and forward-validation pipelines remain separate implementation milestones until endpoints, tests and runtime behaviour are verified.
