# API-Football association-football connector

## Purpose and scope

`netlify/lib/api-football-adapter.mts` is WIN's first adapter for detailed association-football match dossiers. It uses the licensed API-Football v3 service at `https://v3.football.api-sports.io/`. It is designed for an authenticated, owner-approved WIN installation and is **disabled by default**.

This integration is not an open-source data feed. API-Football is a licensed commercial service. The customer must verify that their subscription and the current provider terms permit the specific internal/application use, persistence, and any display planned by WIN. API-Football's terms prohibit resale of its data to third parties. Do not build a data resale or redistribution feature on top of this adapter.

Official references:
- API docs: https://www.api-football.com/documentation-v3
- API terms: https://www.api-football.com/terms
- Pricing and request quotas: https://www.api-football.com/pricing

## Connector operations

Authenticated internal route: `/api/football-data`

| Method | Action | Description |
|---|---|---|
| GET | — | Read readiness, rights blockers, latest sync and recent connector runs without calling API-Football |
| POST | `test_connection` | Call API `/status` and record plan/quota diagnostics; personal account identity is not persisted |
| POST | `find_fixtures` | Find fixtures for `date`, optionally filtered by `leagueId` or `teamId` |
| POST | `sync_fixture` | Retrieve an exact fixture and its authorised match/context sections, then store a source-attributed dossier |

Every request requires the WIN bearer token. An API key alone does not authorize the connector.

## Explicit activation requirements

All requirements must be satisfied before any API-Football request is made:

1. Add the API key as the Netlify Functions-scoped secret `API_FOOTBALL_KEY`.
2. Record the user's/provider customer's acceptance and data-rights approval with `WIN_API_FOOTBALL_DATA_RIGHTS_APPROVED=true`.
3. Set `WIN_API_FOOTBALL_APPROVED_AT` to the approval time in ISO 8601 form.
4. Set `WIN_API_FOOTBALL_APPROVED_BY` to the approving account/role (not a secret).
5. Set `WIN_API_FOOTBALL_TERMS_REFERENCE` to the HTTPS terms or contract URL actually reviewed.
6. Set `WIN_API_FOOTBALL_ENABLED_DOMAINS` to a comma-separated allowlist of the domains permitted by the account/contract.
7. A code reviewer must explicitly change the API-Sports registry record to `licenceReview: "approved"` and `automationAllowed: true`, after verifying the terms and permitted use. Do not treat an environment variable as a substitute for that code review.
8. Redeploy after changing runtime secrets.

The environment-variable approval records an explicit owner decision; it does not itself prove contractual rights. The central provider registry is a second, independent fail-closed gate.

### Data domains

The allowlist may contain only registered domains:

- `fixtures`
- `results`
- `competition_coverage`
- `competition_standings`
- `team_match_statistics`
- `half_time_team_statistics`
- `player_match_statistics`
- `player_ratings`
- `match_events`
- `lineups`
- `injuries`
- `team_season_statistics`
- `player_season_statistics`
- `pre_match_odds`
- `predictions`
- `head_to_head`

Player ratings are separately gated from ordinary player statistics. To import them, enable both `player_match_statistics` and `player_ratings`. Even if the player-stats endpoint returns a rating field, WIN suppresses it from both normalized and raw stored player payloads unless `player_ratings` is explicitly enabled. Match scores are also omitted from normalized and raw fixture payloads unless the separate `results` domain is enabled.

## Dossier contents

When the provider actually returns the fields, the adapter can capture:

- Fixture identity, date/time and timezone, venue, referee, competition, season, round, status, score and periods.
- League/season coverage flags for events, lineups, team statistics, player statistics, standings, injuries, predictions and odds.
- Team match statistics returned by API-Football (documented fields include total/targeted/off-target/blocked shots, shots in/out of box, fouls, corners, offsides, possession, cards, goalkeeper saves, total/accurate passes and pass accuracy).
- Half-time team statistics where the season and competition support the `half=true` option.
- Individual player minutes, starting/substitute status, position, rating (only with separately enabled permission), shots, goals, assists, passes/key passes/accuracy, tackles, interceptions, duels, dribbles, fouls, cards and penalty details where returned.
- Standard match events: goals (including own goals and penalties), cards, substitutions and VAR decisions.
- Formation, coach, starting XI and substitutes.
- Injuries/questionable status, standings, team season aggregates, H2H, provider predictions and pre-match odds when their domains are enabled.

This is **not** a complete optical-tracking or granular action feed. API-Football's standard match event feed documents goals, cards, substitutions and VAR. The documented team statistic endpoint does not promise every pass event, pass origin/destination, pressure, PPDA, xT, xG chain, shot coordinates or full shot maps for every competition. WIN must not infer those from totals. Those fields remain `not_provided` unless an independently authorised source supplies them.

## Coverage semantics

Coverage is stored per competition and season using the response from the leagues endpoint. A coverage flag of `false` becomes `not_in_competition_coverage`. `true` is not a guarantee that a particular fixture has a complete row. The adapter stores actual counts, endpoint audit results, source timestamps and missing sections.

Other states include `not_requested`, `coverage_unknown_not_requested`, `source_error`, `no_records_returned`, `not_authorized_by_enabled_domain` and `not_provided_by_provider`. A missing statistic is never converted into zero.

## Rate limits and operation cost

API-Football pricing is plan-dependent. Its published Free tier has 100 requests/day; published paid tiers have higher limits. The `/status` response and endpoint audit record quota values when the upstream response supplies them. A context-rich fixture sync can call multiple endpoints; do not run broad loops or bulk competition scans on the Free tier without a specific budget and request plan. Use `find_fixtures` only when needed, and do not poll completed fixtures unnecessarily.

The connector limits each response to 5 MB and each API request to 25 seconds. Optional endpoint errors are retained in the audit and make the dossier partial; the successful fixture identity is not discarded.

## Stored data and provenance

- Match dossiers: `library/model-lab/historical-event-datasets`
- Provider sync runs: `library/model-lab/provider-sync-runs`
- Current status: `scheduler-state/api-football-sync`
- Connection test status: `scheduler-state/api-football-connection`

Every stored dossier includes the raw source payloads received by the connector, endpoint audit/quota metadata, retrieval time, a SHA-256 digest of the imported payload set, provider attribution, source URL, and a flag that source-reported data has not been independently verified by WIN.

Each stored dossier also contains a single normalized `records[]` evidence row with `homeTeam`, `awayTeam`, `eventStart`, result fields only when the `results` domain is enabled, and the source-provided team/player/event detail fragments. This is the shared schema consumed by WIN's existing multi-provider `buildMatchEvidencePack` pipeline. The original dossier remains alongside that row so the detailed response and its raw source fields are not lost during cross-provider merging.

API-Football does not become an independent ground-truth validator just because it is the provider. Results used in learning/settlement should still be independently corroborated when the learning policy requires that.

## Current implementation boundary

- Code exists on the feature branch; no API key or rights approval is assumed.
- The provider registry deliberately remains disabled pending the user's and project owner's actual terms/rights review.
- No API-Football endpoint has been called by the implementation work merely to test the provider.
- No fixture dossier has been imported in this feature branch.
- StatsBomb Open Data remains a selective historical/research candidate, not an equivalent live API or an all-competitions replacement.
