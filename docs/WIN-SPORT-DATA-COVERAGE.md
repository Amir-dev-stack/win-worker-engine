# WIN sport-by-sport match evidence standard

## Purpose

Every investigated event should have two separate evidence views:

1. **Pre-match, point-in-time evidence** — only information published/observed before the target kickoff and before the analysis cut-off. Later results, lineups, injuries, odds and match events must never leak into the frozen forecast.
2. **Live/post-match evidence** — actual event state, timeline, team box score, every available player line, ratings and later provider corrections. It is stored separately from the pre-match forecast.

A provider's match-centre endpoint may supply only part of this. WIN reports source-level coverage and never converts a missing statistic into zero.

## Match evidence requested for every sport

- Stable event, participant, competition, season and player identifiers where the source supplies them.
- Event date and exact timezone, scheduled/actual start, venue, officials, attendance, surface/conditions where relevant.
- Current competition table/standings, competition stage, recent schedule/rest and opponent strength.
- Last 5 and last 10 completed matches for each side, season/competition record, home/away or participant-specific splits, period/set/quarter/inning splits and head-to-head.
- A source-linked team and player box score for every match where available.
- A chronologically ordered play-by-play/event timeline, including clock/period and score state where a provider exposes it.
- Player appearances, starters/substitutes, role/position, playing time, every available statistical field, provider rating and explicit rating scale.
- Pre-match player/club availability: injuries, suspensions, returns, confirmed lineups and unknowns, each with publication time.
- Post-match full time and segment scores, event timeline, team/player statistics, ratings, official corrections and source updates.

## Sport-specific statistics catalog

The machine-readable checklist is `netlify/lib/sport-stat-catalog.mts`.

- **Football:** possession, attacks/dangerous attacks, passing volume/accuracy/key/progressive passes, crosses, shots/locations, xG/xA, chances, dribbles, tackles, interceptions, clearances, blocks, recoveries, duels/aerials, fouls, offsides, corners, free kicks, goal kicks, throw-ins, goalkeeper actions, cards and period splits; kickoff, goals, penalties, VAR, substitutions and every available event.
- **Basketball:** points, field-goal/two-/three-point/free-throw makes and attempts, percentages, rebounds, assists, steals, blocks, turnovers, fouls, minutes, plus/minus, shot locations and play-by-play.
- **American football:** passing, rushing, receiving, defensive and special-team statistics; downs, distance, possession, field position, kickoffs, punts, penalties and every play.
- **Ice hockey:** goals/assists, shots, blocks, hits, faceoffs, shifts/time-on-ice, penalties, power play, goaltending and period-by-period play.
- **Baseball:** pitches, counts, pitch speed/type, at-bats, hits, runs/RBI, home runs, strikeouts, walks, earned runs, fielding, baserunners and every plate appearance.
- **Tennis:** serves, aces, double faults, first/second serve percentages and points won, return points, break points, winners/errors, games/sets, tiebreaks, rally/point timeline, retirement/walkover.
- **Cricket, rugby, volleyball, handball, futsal, combat sports, motorsport, golf, esports, table tennis, badminton, darts, snooker, horse racing and cycling:** use the dedicated team/player/event fields in the catalogue and extend it with verified definitions as new sports are added.

## Ratings

Player ratings are provider-created metrics, not objective universal facts. WIN may identify best- and lowest-rated players only within the same match and same provider/scale. It must preserve the provider's scale and methodology where known, never compare different providers' scores as if interchangeable, and never generate a rating when none is supplied.

## Source strategy and current findings

- **API-SPORTS / API-Football** documents fixture-level team statistics (shots, possession, passes, corners, fouls, offsides, cards and saves), halftime statistics, fixture events, lineups and per-player fixture statistics. Its player feed includes rating, minutes, goals/assists, passing, tackling, duels and dribbles. Its own documentation warns that competition/season coverage varies and a coverage flag does not guarantee every match has data. Candidate for an authenticated connector, not yet connected/approved.
- **Sportradar** documents soccer extended match/player/team statistics, player performance scores and event timelines, plus a live coverage matrix where per-competition coverage can differ. Commercial candidate; requires product/competition contract and rights review.
- **SportsDataIO** documents game-level team/player box scores and play-by-play for supported leagues. Its feed descriptions say live stats can trail broadcast by 15–20 seconds and post-final statistics may be corrected. It lists Champions League as the free-trial soccer competition; any feed still requires an actual authorized key/terms review.
- **StatsBomb Open Data** provides match events and lineups for selected competitions and 360 data for selected matches, with attribution requirements. It is valuable for open historical event-level football analysis, but is not universal world-wide live coverage and does not by itself provide every commercial player/season rating metric.
- Existing WIN OpenFootball feeds provide fixtures/results and some World Cup player events. They are not a complete team/player match-stat feed. Existing consensus datasets are betting-market benchmarks, not box-score statistics.

## Activation controls

No commercial provider should be activated merely because its docs are public. Before ingestion, verify account entitlement, supported sports/competition/season, metric availability, update cadence, historical depth, exact definitions, API quota, pricing, data-retention/redistribution rights, attribution and correction policy. Keep all current provider registry rules. The first implementation remains read-only and no-AI; it does not buy a subscription, spend AI budget or write synthetic data into production.

## Explicit completeness statuses

Each sport/match metric group should be reported as one of:
- PRESENT — supplied by a named, timestamped source.
- PARTIAL — some fields exist, others do not.
- NOT PROVIDED — source returned a match record but omitted this metric.
- NOT COVERED — provider/competition/season does not support this feed.
- STALE — source exceeded its configured freshness window.
- CONFLICTED — providers disagree or corrections conflict.
- NOT VERIFIED — coverage or source rights have not been established.

A global claim that a match was completely covered is prohibited unless all required domains were actually received and audited.
