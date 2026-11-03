# WIN operating foundations and completion gates

## New operational capabilities

- `GET /api/coverage`: authenticated evidence coverage report across every registered sport and seven common evidence domains.
- `GET /api/human-coupon-settlements`: authenticated review queue for public human-coupon settlement evidence.
- `POST /api/human-coupon-settlements`: submit a separate HTTPS evidence source and claimed outcome. This creates a review case only; it never changes the coupon outcome.
- `coverage-monitor`: six-hour scheduled snapshot of actual stored evidence, without an AI call.
- Public human coupon imports require an explicit `original human coupon` or `single human pick` classification. Unclassified, promotional, demo and consensus items are excluded from the learning archive.

## Evidence coverage contract

Coverage is computed from records in `library/research-evidence`, not from sport registry membership or source catalog entries. Each sport reports observed record counts and freshness for fixtures, results, odds, lineups, injuries, team/player statistics and market rules. A missing or stale domain remains visibly missing or stale.

Freshness thresholds are operational alerts, not proof of source correctness. Data must still carry a source, retrieval timestamp, event/entity identity and confidence/provenance before it can be used in a decision.

## Settlement contract

Human-coupon settlement evidence is a two-stage process:
1. A user or authorized researcher submits a separate public HTTPS evidence URL, claimed outcome and evidence summary.
2. An independent reviewer verifies event identity, every leg, bookmaker market rules, odds/line, void/push treatment and final outcome.

Stage 1 never changes `library/coupons.outcome`. A tipster's own win claim, screenshot without corroboration, or the original source post is not independent verification.

## Remaining external dependencies

These cannot be honestly completed by code alone:
- API credentials, subscription rights or written permission for commercial sports data providers.
- Official historical odds and market settlement feeds across every sport and bookmaker.
- Authorized API access to social platforms where their terms require it.
- Human independent review of ambiguous settlement evidence.
- Runtime smoke tests with a valid WIN authorization token and real, permitted provider data.

No provider credentials or spending approvals are assumed. AI scheduling remains disabled unless the existing explicit budget gate is approved. Source registry entries are discovery references, not active integrations.

## Release acceptance criteria

- Build and static quality gates pass.
- Production deploy contains the exact latest main commit.
- Authenticated API smoke tests pass for coverage, source import, settlement review, simulation and results.
- A stored evidence record appears in the coverage report with correct sport/domain/freshness.
- A submitted human settlement claim remains pending and does not alter the coupon outcome.
- A full simulation/backtest run is reproduced from a frozen historical dataset with chronological holdout and source provenance.
- Scheduled snapshots are visible in `library/coverage-snapshots`.
- No strategy is promoted to validated without prospective or genuinely out-of-sample evidence and calibration review.
