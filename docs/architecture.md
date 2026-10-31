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
