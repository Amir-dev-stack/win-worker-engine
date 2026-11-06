# WIN Machine-Learning Strategy (2026-11-05)

## Executive decision

WIN will use a sport- and market-specific statistical ML ensemble, not one universal model and not an LLM as the numerical predictor.

Recommended initial stack:
1. Logistic Regression — interpretable probability baseline for binary and multiclass markets.
2. Poisson Regression / attack-defence goal model — football goal counts, score distributions, totals and derived 1X2 probabilities.
3. CatBoost — primary nonlinear challenger for tabular team/player/form/lineup/context features when data volume and quality justify it.
4. LightGBM or XGBoost — optional challenger, selected by chronological out-of-sample performance, not preference.
5. Random Forest — optional diagnostic benchmark, not automatically part of production ensemble.
6. Probability calibration — sigmoid/Platt or isotonic where sufficient calibration data exists; calibration is fitted only on training/validation periods, never on the final holdout.
7. Sport/market-specific ensemble — combine only when it improves proper scoring rules and calibration on walk-forward evaluation.

Start with scikit-learn implementations for transparent baselines and reproducibility. Add CatBoost/LightGBM/XGBoost as separately versioned Python ML components only when a representative dataset and a supported execution environment exist. Do not put model training inside Netlify request handlers.

## What the existing repository currently proves

Read-only inspection of combined PR #10 head `17dc194392de8ff4458dcd18a036d6dde99f315b` found:
- No Python source files, Python dependency manifest or dedicated Python ML service in that baseline.
- `netlify/lib/model-lab.mts` contains a competition/season frequency baseline for football outcomes and goal lines. It requires at least 30 scored matches per dataset and uses chronological 70/30 splits. This is a useful baseline experiment, not a trained feature-based ML model.
- `netlify/lib/market-calibration.mts` evaluates historical closing-consensus probabilities against settled outcomes with chronological 70/30 splits and minimum sample checks. It explicitly evaluates consensus benchmarks, not WIN's own predictive model.
- `netlify/lib/backtest.mts` evaluates historical selections and can report ROI, Brier score and closing-price movement when required provenance exists. This is strategy evaluation, not model training.
- Existing model-lab research pack includes historical event, market, player-event, player-season aggregate and settlement datasets. Their grain, coverage, provenance and licensing differ; they are not automatically model-ready.
- Therefore no production-grade autonomous trained ML predictor is established by this audit. Existing work is valuable research and evaluation infrastructure.

## Sport and market strategy

### Football
- Goals/score: Poisson attack-defence baseline; evaluate Dixon-Coles-style low-score correction only if implementation and data support it.
- 1X2, double chance, draw-no-bet: derive coherent probabilities from score distributions, and compare with direct multinomial Logistic Regression / CatBoost challengers.
- Totals and BTTS: derive from score distributions or train market-specific binary models with market-specific settlement labels.
- Cards, corners and player props: separate models only when sufficient match-level event data, consistent settlement definitions and representative coverage exist.

### Basketball
- Match winner and spread: Logistic Regression baseline, then CatBoost/LightGBM challenger using pace, efficiency, rest, schedule, injuries/availability and lineup features when sourced reliably.
- Totals: regression/distribution model with uncertainty and market-specific calibration.
- Player props: separate models only with match-level player participation/minutes and role/context history. Season aggregates alone are not sufficient for robust match-level forecasts.

### Tennis
- Match winner: Logistic Regression baseline using surface, player strength/Elo, rest and match context; CatBoost challenger if coverage justifies.
- Set/game/handicap and player props: separate market models with explicit retirement/walkover/void settlement rules.

Do not pool unrelated sports or markets into a universal model. Share reusable feature and evaluation tooling, not assumptions about target distributions.

## Autonomous learning lifecycle

1. Ingest source records with licence, provider, capture timestamp, event time, entity IDs and schema version.
2. Validate freshness, coverage, duplicates, missingness, source disagreement and settlement compatibility.
3. Build point-in-time features. A feature is eligible only if it was available at the prediction cutoff.
4. Split chronologically by event time; use rolling/walk-forward folds. Never random-shuffle time-dependent sports data.
5. Train a baseline and challenger with pinned code, dependencies, random seed and dataset snapshot hash.
6. Evaluate on validation folds; calibrate probabilities using validation-only predictions.
7. Preserve a final untouched chronological holdout for promotion evidence.
8. Compare by sport, competition, season, market and odds band using Brier score, log loss, calibration error/plots, coverage and uncertainty. Also assess ROI/CLV only when authentic pre-match and closing prices plus independently settled outcomes exist.
9. Register model artifact, feature schema, training data hash, source/licence metadata, metrics, limitations and approval state.
10. Run challenger in shadow mode beside the champion. Promote only after minimum sample, calibration, stability and risk gates pass.
11. Monitor drift, missing features, source changes and performance degradation; roll back to the last approved model on failure.

Autonomous means the pipeline can ingest, retrain, evaluate, alert and propose a promotion. It does not mean an agent can silently rewrite code, change risk policy, promote an unvalidated model, or change a live decision policy without recorded approval.

## Promotion and safety gates

- No model without a meaningful baseline and chronological out-of-sample evidence.
- Minimum sample is market-specific; 30 observations is an exploratory floor in existing experiments, not sufficient proof for production promotion.
- No leakage from post-event data, closing odds unavailable at decision time, future lineups or later corrections.
- No probability output when mandatory inputs are stale, absent or outside training support; mark that model output unavailable and disclose why; this does not suppress a requested coupon, and the agents advise the user while the user retains the final decision.
- Calibrate multiclass football 1X2 as a coherent three-class distribution.
- Distinguish probability accuracy from betting profitability. Accuracy/hit rate alone is not a promotion metric.
- Evaluate correlation and dependence before combining selections into coupons.
- Store frozen prediction, model version, feature snapshot, odds snapshot and decision timestamp immutably.
- Separate recommendation, manually approved stake and confirmed actual wager.
- No automated bookmaker placement.
- Keep AI/LLM agents as research, explanation, orchestration and challenge roles; they may not fabricate features, labels or model probabilities.

## Deployment recommendation

- Keep Netlify as the current application/API layer.
- Begin model research locally or in an isolated free-compatible Python environment with pinned dependencies and synthetic/test datasets.
- Do not make Hugging Face Spaces, Groq, Cloudflare D1 or another external service a required dependency. Evaluate providers later against cold-start, compute, privacy, licensing, uptime and quota constraints.
- A trained model can initially be packaged for bounded inference, but training jobs should run separately from latency-sensitive Netlify functions.
- No paid plan, automatic upgrade or external service provisioning is authorized.

## Implementation order

1. Audit actual historical dataset coverage and licensing by sport/market.
2. Define versioned feature/label contracts and point-in-time cutoff rules.
3. Add isolated Python ML workspace and reproducible baseline experiments.
4. Implement football Poisson and Logistic Regression baselines first where data supports them.
5. Add chronological walk-forward evaluation and calibration reports.
6. Add CatBoost challenger and compare against baselines.
7. Add basketball and tennis models only when their own data-quality gates pass.
8. Add model registry, shadow evaluation, drift alerts and human-reviewed promotion.
9. Integrate approved inference into WIN through a versioned authenticated contract with graceful degradation.

## Current status

This is the recommended target strategy, not a claim that these models are already trained, deployed or validated. The first implementation milestone is a reproducible baseline experiment using audited, licensed, point-in-time historical data. Until that is completed, WIN must not describe itself as having an autonomous validated ML prediction model.

## Football-first scope and all-market coverage (2026-11-06)

Football is the first complete implementation and validation target across WIN's full registered-sports scope. Its market coverage includes match and period results, double chance/DNB/handicaps, score and goal derivatives, team totals, BTTS, corners, cards, player/team props, Bet Builders, singles, accumulators, system bets and live/in-play markets where verified data and settlement rules support them. See docs/WIN_FOOTBALL_FIRST_MARKET_COVERAGE.md.

The model strategy must not stop at 1X2 and total goals. Keep target distributions and model families market-specific: binary, multiclass, count, score matrix, player-stat distribution and joint/conditional Bet Builder outputs are not interchangeable. Derive markets from football score distributions only where mathematically valid; otherwise build a separate target/model with adequate event-level data.

No minimum combined odds threshold (including 2.50), maximum odds threshold or forced accumulator format is allowed. Evaluate singles, multiples, systems, Bet Builders and in-play markets across odds bands. Odds bands are reporting/calibration cohorts, not eligibility limits. Evaluate actual prices at the decision timestamp and model dependencies between combined selections. When evidence, price, calibration, sample support or risk checks fail, disclose the issue and advise the user; do not automatically suppress the requested coupon. The user decides whether to bet.

Preserve the existing v1 evaluation contract and artifacts. Add a generalized versioned contract for future markets; do not silently reinterpret old 1X2/total-goals records or lower model-quality thresholds to manufacture coverage.

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


## Proactive coupon and ticket-format learning (2026-11-06)

The ML strategy must evaluate not only individual selection forecasts but also the quality of combining selections into coupon formats. Keep these as separate evaluation layers: calibrated sport/market predictions feed a dependence-aware constructor; the constructor compares supported singles, multiples, system tickets, Bet Builders and other formats against settled outcomes. No coupon type is assumed universally best, and no combined-odds floor or ceiling is permitted.

Measure joint probability calibration, leg dependence, performance by format/leg count/market mix/odds band, uncertainty and out-of-sample robustness. Compare against simple baselines and retain chronological holdouts. Only claim a format is superior when sufficient independent evidence supports that conclusion. LLM agents can research and challenge candidate constructions but cannot fabricate probabilities or replace statistical validation.

WIN should proactively scan supported upcoming events and recommend the strongest justified construction, while still supporting user-requested proposals. A scan with no defensible opportunity is a report about that scan, not a forced NO BET policy. The user makes the final decision. Detailed contract: docs/WIN_PROACTIVE_COUPON_INTELLIGENCE.md.
