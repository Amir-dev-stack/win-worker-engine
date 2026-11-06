# WIN Proactive Coupon Intelligence and Continuous Learning

**Status:** target architecture / implementation specification  
**Priority:** football first; all registered sports remain in scope  
**Decision owner:** the human user

## 1. Product behavior

WIN is not merely a coupon generator that waits for a user prompt. Its agents should proactively identify, evaluate and explain betting opportunities from approved event, market, odds and historical-performance data. They should recommend a coupon when the evidence and available markets support a useful proposal, and explain when no compelling opportunity was found in the scanned coverage.

A user may still request a specific coupon, market, match or odds style at any time. Requested proposals must be returned with transparent warnings rather than silently suppressed. Proactive recommendations and user-requested proposals are separate entry paths into the same analysis and construction pipeline.

Agents advise; the user alone makes the final bet/no-bet decision. WIN does not place bets, choose a stake on the user's behalf, or submit bookmaker orders.

## 2. What the agents must learn

Learning must cover both selection quality and ticket construction quality:

- **Event and selection quality:** team/player strength, form, availability, schedule, matchup, tactical and contextual factors, market movement and sport-specific statistics.
- **Market quality:** which market families, periods, lines, thresholds and selection types are better calibrated for a given sport, competition and context.
- **Price quality:** probability versus the actually available price at the decision timestamp, price movement, bookmaker differences and closing-line value where authentic snapshots exist.
- **Combination quality:** dependence between selections, joint probability, shared failure modes, correlation, compounding uncertainty and the effect of adding each leg.
- **Coupon-format quality:** singles, doubles/multiples, accumulators, system products, Bet Builders and other supported ticket structures. Compare formats on like-for-like opportunity sets and explicit settlement rules.
- **Portfolio and exposure quality:** concentration by event, team, league, market, time window and common causal factor. Report exposure implications; do not place or size wagers automatically.
- **Agent quality:** measure each specialist's forecasts, evidence retrieval, calibration, error patterns and usefulness against settled outcomes. Keep agent opinions distinct from validated model probabilities.

Do not assume one coupon type is universally best. The best construction is conditional on sport, market availability, event context, price, dependence, settlement rules and the user's stated preferences. Learn which format performs best in each comparable context, including when a single is preferable to a multi-leg ticket.

## 3. Proactive recommendation lifecycle

1. **Discover:** scan the configured upcoming event universe and supported markets using approved data sources and rate limits.
2. **Normalize:** resolve sport, competition, event, participant, market, period, line, selection, bookmaker and settlement-rule identities.
3. **Snapshot:** store timestamped odds and evidence. Never evaluate a historical decision using information that was not available at that time.
4. **Predict:** run the applicable sport- and market-specific statistical models. LLM agents may research, explain, challenge and orchestrate; they must not invent probabilities.
5. **Challenge:** independent specialists examine data quality, matchup context, price, alternative markets, dependence and plausible failure scenarios.
6. **Construct:** generate and compare candidate ticket structures from supported selections. Calculate joint probability only with a defensible dependence method; do not multiply marginal probabilities as if correlated legs were independent.
7. **Evaluate:** score candidate proposals on calibrated probability, expected value when price and probability are defensible, uncertainty, correlation, coverage, robustness and historical out-of-sample performance.
8. **Recommend:** present the strongest justified proposal(s), explain why the format and legs were chosen, show risk estimates and confidence limitations, and identify reasonable alternatives.
9. **Learn:** after events settle, reconcile outcomes against the exact market/operator rules, score every prediction and coupon construction, and store reviewed lessons with provenance.
10. **Adapt under control:** update challenger models, market-format rankings and agent evaluation profiles in research/shadow mode. Changes to production prompts, model versions, permissions or decision policy require the existing approval process.

The scan schedule, event horizon and supported providers must be configured within existing budget, licensing and rate-limit controls. Do not create paid dependencies or automatic upgrades.

## 4. Candidate coupon construction and ranking

For each eligible opportunity set, the constructor should generate candidate structures across supported formats rather than defaulting to one accumulator template. Candidates may include:

- single selections;
- doubles and larger multiples;
- supported system combinations;
- supported bookmaker Bet Builders and same-event combinations;
- mixed-market tickets where settlement and dependence can be modelled;
- live/in-play proposals only when timestamped live data, latency and market status are reliable.

No minimum or maximum combined-odds threshold is imposed. Odds bands are analysis cohorts, not filters. The constructor must not force a target total price or add weak legs merely to reach a target.

A recommendation record should include at least:

- proposal ID, creation time, event horizon and data cutoff;
- coupon format and bookmaker/market availability snapshot;
- each leg's canonical market ID, line, period, selection, price and settlement-rule version;
- model probability and calibration cohort where available;
- estimated selection risk and whole-coupon risk, with method and uncertainty;
- dependence/correlation method and known limitations;
- expected value only when probability and price are both defensible;
- evidence coverage, freshness, missing inputs and unsupported assumptions;
- agent advice, dissent and reasons for the selected construction;
- alternatives considered and why they ranked lower;
- eventual settlement, correction lineage and user decision if supplied.

Risk percentage must have a defined meaning. Prefer reporting estimated probability of losing the selection/coupon, with a clear complement relationship to win probability only where the probability is valid. Do not label generic confidence as risk. If probability cannot be defensibly estimated, state that risk is not reliably quantifiable and identify the missing evidence. Do not manufacture a percentage.

## 5. Learning and evaluation

Evaluate predictions and coupon construction separately:

**Prediction layer**
- Brier score, log loss and reliability/calibration curves;
- calibration by sport, competition, market, period, line and odds band;
- coverage, abstention/unavailable-output rate, uncertainty and drift;
- chronological walk-forward and untouched out-of-sample evaluation.

**Coupon-construction layer**
- settled win/loss/push/void outcomes under the recorded operator rules;
- joint probability calibration and observed leg dependence;
- performance by format, leg count, market mix, odds band and event context;
- expected-value calibration and realized return only with authentic timestamped prices and complete settlement records;
- comparison against simple baselines (for example, singles, random/naive combinations and market-implied baselines where appropriate);
- robustness to price movement, missing legs, voids and partial settlement.

Use enough independent settled examples and uncertainty intervals before ranking a format as superior. Avoid survivorship bias, overlapping-ticket leakage, repeated-event dependence and tuning on the final holdout. A high historical hit rate alone does not prove an edge.

**Agent learning**
- Score each agent against the information available at its decision time.
- Track calibration and error by task type, not only aggregate reward.
- Preserve source citations, contradictory evidence, confidence and review status.
- Promote lessons only after repeatable validation; a persuasive narrative is not evidence of predictive skill.

## 6. User-facing recommendation contract

A proactive recommendation should clearly state:
1. what event window and market coverage were scanned;
2. the recommended coupon format and exact legs;
3. available prices and their capture time;
4. estimated win/loss probabilities and risk, only where defensible;
5. the strongest reasons and strongest counterarguments;
6. correlation, uncertainty, missing data and settlement caveats;
7. why this construction ranked above alternatives;
8. that the user makes the final decision.

If a scan finds no defensible recommendation, report the coverage and explain that no candidate met the evidence standard. This is not an automatic rejection of a user-requested coupon. If the user asks for a proposal, return it with explicit warnings and unverified/unpriced fields as needed.

## 7. Football-first, multi-sport expansion

Football is the first end-to-end implementation and validation target. Start with its full market taxonomy and settlement contract, then point-in-time data, market-specific targets, model baselines, coupon dependence and ticket-format evaluation. Do not claim full market support merely because a market exists in the catalogue.

After football passes its own data and evaluation gates, extend the shared discovery, construction and learning infrastructure to each registered sport. Every sport needs its own event model, features, market taxonomy, probability targets, dependence assumptions and settlement rules. Do not transfer football assumptions to basketball, tennis or other sports.

## 8. Guardrails

- No promise of perfect or near-perfect prediction. The objective is measurable, calibrated improvement with honest uncertainty.
- No fabricated odds, source coverage, probabilities, results, settlements or performance claims.
- No minimum/maximum coupon odds restriction.
- No forced accumulator format and no universal best-coupon rule.
- No automatic NO BET decision on behalf of the user.
- No automated bet placement, staking or bookmaker account actions.
- Preserve licensing, provenance, chronological splits, sample-size, owner-approval, budget and shadow-only gates.
- A missing model output is an explicit analytical limitation; it must not be disguised as a prediction or confused with the user's decision.
