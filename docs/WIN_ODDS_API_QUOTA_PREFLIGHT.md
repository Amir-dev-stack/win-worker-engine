# WIN The Odds API quota preflight

This offline estimator is a guardrail for planning a possible zero-cost forward-collection pilot. It is not a provider connector and does not activate the source.

## Cost assumptions

The official The Odds API v4 documentation states:
- Current odds: quota cost is 1 per unique market returned per region. For conservative planning, WIN uses the configured market count as an upper bound; empty responses may cost zero.
- Historical odds: quota cost is 10 per unique market returned per region.
- The response headers `x-requests-used`, `x-requests-remaining`, and `x-requests-last` report actual usage.

Reference: https://the-odds-api.com/liveapi/guides/v4/

## Planner behavior

`planOddsApiMonthlyQuota()` estimates each request family as:

`marketCount × regionCount × monthlyCalls × (historical ? 10 : 1)`

It subtracts a protected reserve from the configured monthly allowance, reports 80%/95% thresholds, and blocks plans that would consume the reserve. It rejects duplicate IDs, invalid counts and integer overflow.

## Hard boundaries

- No API requests, API key access, storage writes, provider activation or account changes.
- The estimator is conservative because it budgets configured markets even though the provider bills based on unique markets actually returned.
- Provider response headers must be persisted and reconciled against the estimate if a future owner-approved collector is implemented.
- The quota plan never changes `automationAllowed: false` in the provider registry and always returns `providerActivationAllowed: false`.
- A free quota is not a promise of unlimited collection. A single 1-market/1-region request per event poll still consumes credits.

The free Starter allowance previously identified in the source audit must be rechecked in the account dashboard immediately before any activation; this planner requires the owner to supply the actual monthly limit rather than hardcoding a plan tier.
