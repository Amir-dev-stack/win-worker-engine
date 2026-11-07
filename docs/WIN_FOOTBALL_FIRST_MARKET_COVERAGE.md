# WIN Football-First Market Coverage Contract

Status: implementation scope and sequencing decision; no model, live-data, bookmaker, or production capability is implied.

## Product scope and priority

WIN is intended to support all sports in its registered sport catalogue. Football is the first complete implementation and validation target. Shared infrastructure may be sport-neutral, but models, features, targets, odds interpretation, market rules and settlement remain sport- and market-specific.

1. Complete the football market taxonomy and settlement contract.
2. Build football data normalization, odds snapshots, point-in-time features and market-specific labels.
3. Implement and test football statistical baselines and market derivations.
4. Validate football evaluation, calibration, odds-band analysis, risk estimates and human-decision behavior end to end.
5. Expand to the other registered sports using shared infrastructure and independent sport-specific contracts.

## Betting-style and odds policy

- No minimum combined coupon odds threshold, including 2.50.
- No maximum odds threshold and no forced accumulator format.
- Analyse singles, multiples/accumulators, system bets, Bet Builders and live/in-play markets where source data and settlement definitions support them.
- Evaluate individual odds, combined odds, price movement, market coverage and odds bands. Odds bands are analytical cohorts, not eligibility floors or ceilings.
- A market may be supported for probability estimation but unavailable for recommendation when current price, evidence, sample size or settlement data is missing.
- Do not automatically return NO BET or suppress a requested coupon. Generate the requested proposal and clearly disclose weak evidence, missing prices or risk. Never fabricate facts or odds; when risk cannot be quantified, say so.

## Football market taxonomy

The registry must be extensible and versioned. A market identity describes sport, competition, event, market family, period/segment, participant/team/player, line/handicap, selection, odds format, bookmaker/source, market timestamp and settlement-rule version. Operator labels are aliases, not canonical model targets.

### Match result and result combinations
- 1X2 / match winner; double chance; draw no bet; European handicap 1X2; Asian handicap.
- Half-time result, full-time result, half-time/full-time, win either half, win both halves and result in both halves.
- Correct score, multi-score/result bands, winning margin and result combinations.
- Result + goals, result + BTTS, double-chance + goals and other operator Bet Builder combinations.

### Goals and scoring
- Match totals and alternative over/under lines; team totals; first/last team to score; BTTS.
- Goal bands/intervals, exact goal counts, win-to-nil, clean sheet, score in both halves, both halves over/under and team to score in each half.
- Refund/push-aware markets and Asian goal totals.
- Correct-score and score-distribution derivatives where coherent probabilities can be computed.

### Corners
- Match/team corners totals, alternative lines, handicaps, first-half/second-half corners, corner race and first-to-N where offered.
- Example: first-half total corners under 5.5 means 0–5 corners win and 6+ lose, subject to the operator settlement rule.
- Corner counts, period boundaries, abandonment and operator settlement must be explicit.

### Cards and discipline
- Match/team/player cards; total cards over/under; first-half/second-half cards; handicap cards; red-card markets where offered.
- Normalize card points separately from card counts; yellow/red weighting is not universal.

### Player and team performance props
- Player shots, shots on target, goals, assists, tackles, fouls, cards, passes and other listed event props.
- Team shots, shots on target, fouls, offsides, saves and goalkeeper saves.
- Require player identity, participation status, minutes/appearance rules, event-level data and operator-specific settlement.

### Bet Builders, multiples and system products
- Preserve each component selection and its market/period/participant/line identity.
- Model component probabilities and dependence; do not multiply marginal probabilities as if correlated events were independent.
- Define same-game correlation, void-leg behavior, partial settlement, system combination structure and payout calculation.
- Operator formats such as fixed selections plus combinations (including Maxikombi-style systems) belong to the ticket/settlement layer, not a new prediction target.

### Live / in-play
- Store event-state and odds snapshots with source timestamps, score, clock/period, cards, substitutions and other state available at decision time.
- Enforce strict point-in-time feature cutoffs; reject delayed, stale or post-event data.
- Distinguish pre-match and in-play model versions, features, calibration and settlement records.

This is the initial canonical family inventory, not a claim that every bookmaker catalogue has been ingested. Add aliases and markets only from verified operator catalogues and actual source coverage. Never invent support.

## Canonical market and settlement contract

A canonical market definition includes market ID/version, sport/family, period convention, subject scope (event/team/player/pair), line value/type, handicap direction, selection key, target definition and outcome domain (binary, categorical, count, score distribution or ordinal), odds format, price timestamp semantics, operator aliases, provenance, and settlement-rule ID/version/effective dates.

Settlement rules specify win, loss, push, half-win, half-loss, void, cancellation, abandonment, postponement, extra-time inclusion, player non-participation, retirement/walkover and correction handling where relevant. Rules vary by operator and market; do not assume one universal rule.

Predictions bind to the exact canonical market version, target, event, participant/period/line, feature snapshot, odds snapshot, model version and decision cutoff. Outcomes bind to reviewed settlement records. Corrections are append-only and independently reviewed.

## Model and evaluation requirements

- Keep win.ml.model.evaluation.v1 immutable for existing artifacts. Add a backward-compatible next contract version for generalized sport/market evaluation.
- Replace the two-market closed union with a versioned market-registry reference and validated target schema. A free-form market string alone is insufficient.
- Separate output shapes: multiclass probability vector, binary probability, count/distribution forecast, score matrix, player-stat distribution and joint/conditional combination model.
- Derive coherent football markets from a validated score distribution only where mathematically valid; use dedicated models when target definition or data grain requires them.
- Evaluate by sport, competition, market version, period, line/participant cohort, season, source coverage and odds band. Report proper scoring rules, calibration, sample counts, uncertainty and coverage. ROI/CLV requires authentic time-aligned prices and independently settled outcomes.
- Use chronological splits and point-in-time features for every market. Market-specific sample gates must be justified, never lowered to make a model pass.
- Support for one market does not imply support for another market, period, line or operator settlement rule.
- Never train/evaluate on unlicensed, synthetic-as-real, guessed, duplicated or future-leaking records.

## Football-first acceptance gates

1. Versioned canonical registry covers the football families above and tests aliases and unknown markets.
2. Settlement tests cover win/loss plus relevant push, half-settlement, void, abandonment, extra-time, player non-participation and correction cases.
3. Every prediction traces to exact event, market version, line, period, participant, model, feature and odds snapshots.
4. Point-in-time checks reject late features and stale/post-event odds.
5. Market-specific probability/forecast schemas validate and cannot be confused across families.
6. Backtests use chronological holdouts, authentic prices and independently reviewed outcomes; report coverage and uncertainty.
7. Odds-band reporting includes low and high price ranges without a blanket minimum or maximum odds filter.
8. Singles, multiples, systems, Bet Builders and in-play tickets have separate ticket/dependence/settlement tests.
9. Missing data, unsupported market versions, weak calibration or failed risk checks must be disclosed as warnings in the requested coupon; they do not automatically suppress coupon generation or decide the user's bet/no-bet choice.
10. Passing tests do not authorize bookmaker placement, production model promotion or risk-policy changes.

## Current implementation gap confirmed during PR #11 inspection

The current model evaluation contract only accepts 1x2 and total_goals, and the market evaluation registry validates a three-class HOME/DRAW/AWAY vector and football consensus-market source records. These are a useful first football 1X2 vertical, not the universal market architecture. Keep them stable for existing artifacts; build the generalized, versioned contract alongside them, then migrate market by market with compatibility tests.

## Human-owned final betting decision (2026-11-06)

This section supersedes any wording elsewhere that implies WIN or its agents automatically reject a requested coupon, enforce a NO BET decision, or make the final betting decision.

- When the user requests a coupon, WIN must generate and present a coupon proposal. Agents must not suppress the requested coupon merely because evidence is incomplete, model confidence is low, odds are unusual, or a risk threshold is exceeded.
- The coupon proposal must distinguish verified evidence, model estimates, assumptions, missing data and unsupported markets. Never fabricate odds, probabilities, event facts, source coverage or settlement terms to make a coupon appear complete.
- For every selection and for the coupon as a whole, agents report an estimated risk percentage only when a defensible calculation is possible, explain the method and uncertainty, and give clear advice. If a defensible percentage cannot be calculated, state 'risk not reliably quantifiable' and explain what is missing; do not invent a number.
- Agents may recommend avoiding a selection or the entire coupon, explain downside scenarios, flag correlation and identify weak evidence. These are recommendations, not execution gates or final decisions.
- The user alone decides whether to place a bet. WIN does not place bets, stake funds or submit bookmaker orders as part of this advisory workflow.
- Keep analytical states separate: model/data eligibility, risk estimate, agent recommendation, coupon proposal status and user decision are distinct fields. A low-confidence or incomplete-evidence proposal remains visible with explicit warnings.
- If a market cannot be verified or priced, show it as unverified/unpriced in the requested proposal and offer a clearly marked alternative where possible. Do not silently omit it or pretend it is supported.
- Coupon generation is mandatory for a requested coupon; automatic bet placement is not authorized.
