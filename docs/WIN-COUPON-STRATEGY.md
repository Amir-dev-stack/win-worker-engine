# WIN coupon construction strategy

Status: product decision and implementation contract. This document does not claim that the full multi-sport scanner, joint-probability model, or automatic coupon constructor is already implemented.

## 1. Core objective

WIN's primary objective is to find the strongest available selections and construct useful coupon proposals with the highest defensible probability of the **entire coupon winning**. Combined odds and potential return matter, but they are secondary to probability quality and evidence.

The system must not optimise for high odds alone, nor assume that low odds automatically mean a good coupon. It must compare the probability/price trade-off and explain it.

## 2. Sport rollout: football first, multi-sport by design

- The long-term discovery layer is sport-neutral and should scan every sport in WIN's registered sport catalogue when event, market, odds and settlement coverage are available.
- Football is the first complete implementation, data-quality, calibration and live evaluation track.
- During the football validation phase, agents investigate football matches and football markets deeply, build football-only proposals, and learn from independently reviewed settlements.
- Expansion to basketball, tennis and other registered sports follows only after the football workflow is demonstrated end to end. Each sport needs its own data, market, model, calibration and settlement validation.
- Once multiple sports have validated coverage, the constructor may combine selections from different sports in one coupon. It must not force a single-sport coupon when a better-supported mixed-sport construction exists.
- A catalogue entry or generic market taxonomy is not proof that live events, prices or reliable model coverage exist for that sport.

## 3. Coupon discovery and construction

Agents should:
1. Scan the supported upcoming event slate, not just a user-named match, when the user asks WIN to find opportunities.
2. Investigate each candidate using sport- and market-specific specialists: event/team/player form, relevant statistics, availability/injuries where verified, schedule/context, market prices and movement, source quality, settlement rules and model calibration.
3. Compare multiple suitable market types for the same event rather than defaulting to match winner/1X2.
4. Estimate each selection's probability and uncertainty using timestamp-valid evidence.
5. Build and compare candidate coupon structures: singles, doubles, accumulators, mixed-sport combinations, system products and same-event builders where supported.
6. Rank proposals primarily by the estimated probability of the complete coupon, with price, combined odds, payout profile, uncertainty, coverage and downside shown alongside.
7. Explain why each leg belongs in the coupon and what would make the estimate unreliable.

The constructor may proactively recommend a coupon structure based on accumulated, validated learning even when the user has not specified a coupon format. It must still present the reasoning and leave the final betting decision to the user.

## 4. Probability before odds; no arbitrary odds band

- Do not impose a universal minimum or maximum combined-odds threshold.
- Analyse lower-odds and higher-odds constructions. Prefer the one with the strongest defensible whole-coupon probability when that is the stated objective; show the return trade-off rather than quietly optimising for payout.
- Do not add weak legs merely to increase combined odds or reach a target.
- Do not label a coupon "safe", "guaranteed" or "certain". Even a high estimated probability can lose.
- Show decimal odds and the implied probability separately. Where possible, remove bookmaker margin before using market probabilities as a benchmark.
- Clearly distinguish model probability, market-implied probability, calibrated probability, and observed historical win rate. They are not interchangeable.
- Report uncertainty and sample size. A point estimate without calibration/validation context is not enough to call a selection high-confidence.

## 5. Whole-coupon probability and dependence

- Never estimate an accumulator's win probability by blindly multiplying each leg's marginal probability.
- Same-event selections can be strongly dependent; different events can also share common factors (weather, teams, league conditions, shared data/model errors, correlated market movement).
- Use a validated joint or conditional probability model for the actual coupon structure, with out-of-sample evidence and a clearly versioned method.
- If no defensible joint estimate exists, still create the requested proposal, but mark whole-coupon probability and risk as "not reliably quantifiable". Do not replace missing evidence with an independence assumption.
- For a multi-leg coupon, show leg probabilities and the whole-coupon estimate as separate quantities. Never present the weakest-leg probability as the coupon probability.

## 6. Human decision and proposal availability

- When a user requests a coupon, WIN always returns a proposal; agents do not suppress it or make the final bet/no-bet decision.
- Missing data, low confidence, unverified prices, unsupported markets or an unvalidated dependence model are disclosed as warnings. They do not justify fabricating data or silently omitting the requested proposal.
- Agents may advise against a selection or coupon and explain why. That advice is not an execution gate.
- The user alone decides whether to place a bet. WIN does not place bookmaker orders or stake funds.
- Keep separate fields for evidence/data status, probability estimate, uncertainty, risk assessment, agent recommendation, proposal status and user decision.

## 7. Learning loop

For every proposed coupon, preserve an immutable pre-event snapshot containing:
- event and sport identity; canonical market and settlement-rule versions;
- selection, line/period/participant, bookmaker/source and odds timestamp;
- raw and de-vigged market probability where available;
- model probability, model/data version, prediction cutoff and feature provenance;
- whole-coupon probability method, dependence evidence and uncertainty;
- combined odds, proposal rationale and warnings.

After settlement, record the independently reviewed outcome, void/push/partial-settlement treatment and correction history. Compare predicted and observed outcomes chronologically. Evaluate calibration, Brier score, log loss, reliability by probability/odds band, coupon size, sport, market, competition and construction format. Track closing-line value only with authentic time-aligned prices and explicit margin semantics.

Learning must compare like with like, retain losing as well as winning proposals, and avoid changing the model based on one result. Use chronological holdouts and adequate sample sizes. A format's historical win rate alone does not prove future edge or profitability.

## 8. Rollout gates

### Phase A — football
- Complete football event discovery and supported market/settlement coverage.
- Build candidate analysis and coupon proposal workflow.
- Validate individual market probabilities and calibration.
- Develop and independently validate joint probability for multi-leg football coupons.
- Record proposals and settlements; evaluate out of sample before claiming a reliable coupon probability.

### Phase B — additional sports
- Add each sport through its own data/market/settlement contract and validated model.
- Establish comparable probability calibration and source quality before the sport can contribute high-confidence selections.
- Enable mixed-sport coupons only after the cross-sport joint-probability method has been validated on chronological held-out coupons. Until then, mixed-sport proposals can be shown with an explicit unquantified whole-coupon risk warning, not a fabricated probability.

### Phase C — portfolio of coupon formats
- Compare low-odds/high-probability profiles, higher-odds profiles, singles, multiples, systems and mixed-sport constructions on the same evidence standard.
- Let validated chronological learning inform proactive format recommendations.
- Keep user control and the no-automated-betting boundary unchanged.

## 9. Current implementation boundary

Existing WIN foundations include a broad sport/market catalogue, football-first scope, coupon-construction cohort evaluation and a correlation gate. The current coupon-construction evaluator is retrospective research only; its multi-leg cohorts require validated joint-probability evidence. The current correlation gate blocks quantitative approval of multi-leg probability estimates when dependence is unmodelled.

These foundations do **not** yet constitute a complete autonomous all-sport event scanner or production coupon constructor. The implementation must preserve the distinction between:
- generating a visible proposal;
- having enough evidence to quantify its whole-coupon probability;
- an agent's recommendation;
- the user's final decision.

No automated betting, bookmaker placement, or automatic stake execution is authorised by this strategy.

## 10. Draft availability versus probability qualification (2026-11-06)

The worker's coupon-candidate collector now treats dependence diagnostics as an advisory probability boundary rather than a proposal-generation veto:

- Any non-empty candidate leg set is retained as `DRAFTABLE` unless it is a fully evidenced single-leg `QUALIFIED` candidate. Missing leg evidence remains visible in `blockers` and `dataQualityStatus`; it does not silently erase the proposal.
- For multi-leg proposals, `probabilityWarnings` explain same-event or cross-event dependence limitations. `jointProbabilityAvailable` is false and `probabilityStatus` is `marginal_only_joint_unavailable` until a validated model exists.
- WIN does not multiply leg prices into a purported combined price for same-event combinations. For distinct-event legs with valid prices, `theoreticalOddsProduct` is shown separately and explicitly labelled as a mathematical price product, not a bookmaker-quoted accumulator price or a joint win probability.
- `combinedOdds` is retained only for a qualified single-leg candidate in this path. The user remains responsible for confirming the actual bookmaker price and deciding whether to bet.

This corrects the earlier worker behavior that merged correlation blockers into the coupon's hard blocker list and changed every multi-leg proposal to `BLOCKED`. Quantitative approval remains withheld; proposal availability is not.
