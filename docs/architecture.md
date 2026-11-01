# WIN execution architecture

1. REST/MCP caller submits an event brief.
2. The run record is persisted and a Netlify Background Function is invoked.
3. Eight independent specialist workers are called in parallel. Each gets a separate Responses API request and no peer reports.
4. Four debate reviewers receive the original brief plus first-pass reports and challenge evidence, assumptions, market settlement and quantitative reasoning.
5. Global Master receives all reports and applies the final BET / WAIT / NO BET gate.
6. The completed run is stored; a frozen prediction snapshot is written separately.
7. Results are appended separately with a settlement source and evidence. Forecast objects are never edited by the result endpoint.

## Worker roles

- Recent form and performance
- Lineups, injuries and availability
- Tactics and matchup
- Sport-specific statistics
- Competition and context
- Markets and settlement
- Human tipster / Strefa Inspiracji evidence
- Independent skeptical FOR/AGAINST red team

Debate roles: FOR challenger, AGAINST challenger, market-settlement auditor, quantitative evidence reviewer.

## Evidence boundaries

The web search tool is enabled in Responses API requests by default. Search citations are captured from response annotations. The app cannot guarantee every statement has been verified, and the final operator must inspect source quality. The app does not bypass login walls or automate STS account access. Human tip evidence may be imported with source URL and capture time.

## Persistence

Netlify Blobs stores JSON records in a site-wide store in eu-central-1. Keys are unique and records are immutable by convention; the API only appends results and writes frozen forecasts once. Blobs has eventual consistency and no transactions or atomic compare-and-swap in this design. It is a small single-operator MVP, not a high-concurrency ledger. Use Postgres with unique constraints and append-only permissions before scaling.


## Central mission and learning lifecycle

The architecture serves WIN's central mission: research, validate and construct the strongest evidence-supported high-probability coupons realistically achievable. Every worker role must contribute to selection quality, risk reduction, probability calibration, verified learning or an evidence-based NO BET decision. The 99% aspiration is not a guarantee and cannot be used as an unsupported confidence label.

The learning system operates in two phases:
- **Intensive learning:** prioritized coverage research, strategy documentation, chronological historical testing, out-of-sample validation and prospective paper tracking.
- **Mature intelligence:** entered only after both priority coverage targets and strategy evidence gates are met. Broad exploratory work is reduced, while scheduled monitoring, settlement audits, calibration and strategy-decay checks continue. Material changes or evidence gaps can reactivate intensive research.

Strategies have explicit evidence states; a historical hit rate or simulation alone cannot promote a strategy to mature. Coupon approval remains subject to all department reports, independent FOR/AGAINST and market/quantitative challenges, library review, integrity controls and the Global Master BET / WAIT / NO BET decision. Missing mandatory evidence means NO BET.

See [WIN mission and learning policy](WIN-MISSION.md) for the complete objectives, exit criteria, metrics and safeguards.
