# WIN master specification: match, player and event statistics

## Purpose

WIN must build an evidence-backed dossier for a sporting event, not a small score-and-shots summary. The dossier should cover:

1. **Before the event:** competition context, standings, form, home/away splits, head-to-head, squad/athlete availability, tactics and pre-event market snapshots.
2. **During and after the event:** the event timeline, team statistics, the full available participant/player box score, ratings where a source actually supplies them, and source-level coverage.
3. **After the event:** performance and tactical interpretation, comparison of the pre-event hypothesis with what happened, and a learning record that does not treat one match as proof of a future betting edge.

The data catalogue defines the metrics WIN should recognise. It does not imply that a provider supplies every metric for every event. The provider registry, actual imported records and per-source coverage determine what WIN can report.

## Canonical event dossier

Every event should have a stable provider ID where available, canonical sport and competition, participants, scheduled start, venue, season/round, event status, result, source references, source licence/terms status, retrieval time and a raw-data checksum where a source file is imported.

Store source-native fields and normalised fields together. Keep provider definitions and rating scales attached to their own source. Merge complementary feeds for the same event without discarding the per-provider records. Conflicting scores, timestamps, statistics or identities must be visible for review; do not silently select whichever value looks best.

Time semantics matter:
- Preserve the exact scheduled kickoff/start time when known.
- Mark date-only or approximate event times as such. Never silently convert a date-only value into a verified kickoff time.
- Pre-event form and market evidence must be cut off strictly before the event starts.
- In-play and post-event information must never leak into a frozen pre-event forecast.
- Retain event-period and event-clock semantics such as first half, second half, quarter, set, inning, round, lap or map.

## Pre-event report

### Competition and event context

Collect where available: competition format and phase, table/standings, points, ranking, qualification/relegation or tournament incentives, schedule, rest days, home/away or venue context, recent travel, surface/pitch/course/track conditions, weather and other sport-specific conditions.

### Form and history

Show recent results with dates, opponents, venue and score; current-season and competition-only form; home/away splits; scoring and conceding rates; period-by-period performance; head-to-head history; and longer-term trends. Label sample size, date range, competition and source. Do not turn a small sample into a confident trend.

### Participants and availability

For team sports, identify the roster, coach/manager, confirmed starters, substitutes, formations/roles where supplied, injuries, suspensions, doubts, returning players, likely rotations and schedule congestion. For individual sports, identify the athlete, opponent, draw/bracket, event format, surface/course/conditions, recent workload and reported availability. Distinguish confirmed facts from predictions and unknowns.

### Market snapshot

Preserve market name, line, selection, price, bookmaker/source, capture timestamp and event start. A snapshot is pre-event only when its capture time precedes the event start. Never call a consensus probability an individual bookmaker price, or a post-event price a pre-event price.

## In-event and post-event match statistics

A match report must include all provider-supplied sections, not just the examples below. A source may publish only part of the list. WIN should show what exists and a coverage audit for what is absent.

### Football / soccer team statistics

Recognise and report, where supplied:

- **Score and match state:** full-time, half-time, extra-time and penalty-shootout scores; period scores; goals, own goals and penalties.
- **Possession and territory:** possession share, total attacks, dangerous attacks, field tilt, time in each phase/third, entries into the attacking third and penalty area, territory and possession sequences.
- **Passing and distribution:** attempted, completed and accurate passes; accuracy; passes by length/direction; progressive passes and carries; key passes; through balls; crosses and their success; passes into the final third/box; pass maps and sequences where supplied.
- **Attacking and chances:** total shots, shots on target/off target/blocked, shot locations, inside/outside-box attempts, big chances, xG, xGA, xGOT, expected assists, chance creation, successful dribbles, take-ons, counterattacks and transitions.
- **Set pieces and restarts:** corners, free kicks, throw-ins, goal kicks, kick-offs, penalties, second balls and set-piece outcomes.
- **Defending and pressing:** tackles attempted/won/success, interceptions, clearances, blocks, recoveries, pressures, counter-pressures, high turnovers, duels, aerial duels and PPDA where the source defines it.
- **Discipline and stoppages:** fouls committed/suffered, offsides, yellow/red/second-yellow cards, injuries, treatment, added time and VAR checks/decisions.
- **Goalkeeping:** saves, shots faced, goals conceded, clean sheets, save percentage, penalties saved, high claims, punches, sweeper actions and post-shot metrics where supplied.
- **Physical output:** distance covered, high-intensity distance, sprints and player/team workload where supplied.

Terms such as “attacks”, “dangerous attacks”, “big chance”, “pressure”, “PPDA”, “expected threat” and “field tilt” can differ between providers. Keep the source definition and do not compare incompatible definitions as if they were identical.

### Chronological football event timeline

Retain every available event with its source event ID, period, match clock, elapsed time or timestamp, participant(s), team, event type, outcome and source description. Event types include kick-off, period start/end, pass, carry, attack/transition, shot, blocked shot, save, goal, own goal, penalty award/score/miss, corner, free kick, throw-in, goal kick, offside, foul, tackle, interception, clearance, recovery, duel, card, substitution (on/off), injury/stoppage, VAR review/decision, added time and final whistle.

A provider that supplies only a commentary feed must not be presented as a complete optical/event-tracking feed. A timeline with goals and cards is not proof that every pass or attack was captured.

### Other sports

Use the sport-specific team and athlete/player metric groups and event types in `sport-stat-catalog.mts`. The catalogue must stay aligned with `sport-registry.mts`. It covers, among others:

- Football, futsal, rugby and field hockey.
- Basketball and American football.
- Ice hockey, baseball and cricket.
- Tennis, table tennis, badminton, squash and padel.
- Volleyball, handball, water polo, lacrosse and floorball.
- Boxing and MMA.
- Motorsport, golf, darts, snooker, horse racing, greyhound racing and cycling.
- Water sports, athletics/track and field, and winter sports.
- Esports.

For each sport, include the correct scoring format and event sequence: for example possessions and fouls in basketball; passes, rushes, tackles, sacks, kickoffs, punts and downs in American football; shifts, faceoffs and goaltending in ice hockey; serves, return points, games and sets in tennis; innings, deliveries, batting and bowling in cricket; laps, sectors, pit stops and race-control events in motorsport. Do not apply football fields to another sport simply because the data shape looks similar.

## Individual player / athlete report

Create a line for every participant appearing in the provider's match record, with stable player/athlete ID where available, name, team, position/role, starter/substitute status, minutes or playing time, substitution details and source.

Show every statistic supplied for each individual. Sport-specific lines can include:

- **Football:** minutes, rating, goals, assists, shots, xG/xA, key passes, chances created, passes attempted/completed/accuracy, crosses, progressive passes/carries, dribbles, tackles, interceptions, clearances, blocks, recoveries, pressures, duels, aerials, fouls, cards, offsides and goalkeeper metrics.
- **Basketball:** minutes, points, field-goal/three-point/free-throw attempts and makes, rebounds, assists, steals, blocks, turnovers, fouls, plus/minus and advanced efficiency.
- **American football:** passing attempts/completions/yards/TDs/interceptions/sacks; rush attempts/yards/TDs; targets/receptions/receiving yards/TDs; tackles, sacks, interceptions, fumble recoveries, field goals, kickoffs, punts and returns.
- **Ice hockey:** ice time, shifts, goals, assists, shots, blocks, hits, faceoffs, takeaways/giveaways, penalty minutes and goalie saves.
- **Tennis/racket sports:** serve and return percentages, aces, double faults, winners, forced/unforced errors, break points, points/games/sets and movement where supplied.
- **Baseball/cricket and other event sports:** use the appropriate batter/pitcher, batter/bowler, runner/jockey, driver/rider, fighter, golfer or athlete-specific box score.

### Ratings policy

Show ratings only when a provider supplies a real rating or WIN has a separately documented, tested scoring model. Always label the provider and scale. Highest- and lowest-rated players may be compared within the same match and the same provider/scale. Do not rank a 7.8 from one provider against a 7.8 from another as if scales are interchangeable. If no rating is supplied, display “not provided”; do not invent a number or substitute a goals/assists score.

## Post-event interpretation

Separate facts, derived calculations and interpretation. Compare the pre-event forecast with actual line-ups, game state, event timeline and match statistics. Explain the scoreline relative to chance quality, finishing, goalkeeper performance, red cards/injuries and tactical game-state changes. Identify outliers, likely regression candidates and uncertainty; do not infer causation from correlation alone.

For football, useful interpretation includes xG versus goals, xGA and shots conceded, xGOT, shot locations, pressing and PPDA, territory, progression, set pieces, transition chances, defensive errors, substitutions and how the first goal changed the opponent's approach. A single blowout or high conversion rate must not automatically become a future team-total or handicap recommendation.

## Betting and decision framework

When the dossier is used for betting research, consider:
- Whether the pre-event evidence supports the selected market and the market's exact settlement rules.
- xG/xGA, shot quality, chance creation/concession, pressing, transition and set-piece profiles rather than only recent scores.
- confirmed line-ups, injuries, suspensions, rotation, schedule congestion, motivation and event conditions.
- market price, capture time, price movement, probability, uncertainty and sample size.
- correlation between selections, portfolio exposure and whether each event/market is independently evidenced.

A market is not “safe” merely because it is a team total, Asian handicap or under. If event identity, source data, rules, price or sample quality is insufficient, return WAIT/NO BET instead of forcing a coupon. Do not treat the post-event match dossier as evidence that the same outcome is repeatable.

## Coverage, provenance and unknowns

For every target event, show:

- metrics/sections actually present at team and player level;
- event types actually observed;
- missing, stale, partial, conflicting or unsupported groups;
- which provider supplied each section and when it was retrieved;
- source URL, licence/terms status, attribution and checksum where applicable;
- participant/player coverage (including players without ratings);
- any truncation or ambiguity in merged source records.

A missing statistic is `not_provided` / unknown, never zero. Zero is valid only when the source explicitly reports zero. Do not silently convert missing, null, false, unobserved or inapplicable into the same value.

## Source registry and connection rules

The project records these football reference destinations:

- UEFA official match centres: competition match reports and selected official team statistics.
- FotMob: xG, shot maps, timelines and provider-defined player ratings where exposed.
- ESPN: event commentary, scoreboards and sport-specific box scores.
- FootyStats: historical H2H and trend context.

These destinations are references until their official API access, terms, rate limits, licensing and reuse/redistribution rights are verified. They are not permission to scrape pages or redistribute content. The current nflverse adapter is a separate American-football feed under its stated CC BY 4.0 attribution; it is not a football match-statistics feed.

Commercial API-Sports, Sportmonks, Sportradar, SportsDataIO and The Odds API connections require provider-specific credentials/contract, sport/competition coverage checks and explicit rights review. StatsBomb Open Data remains a selective research candidate until its terms and reuse requirements are approved. A source-discovery result or a catalogue entry is never the same as a connected provider.

## Implementation acceptance criteria

A match-statistics integration is complete only when all are true:

1. Its source is registered with verified data domains, licence/terms reference, attribution and access mode.
2. The adapter uses only approved domains and preserves raw/source provenance.
3. The adapter has tests for identity, time semantics, event timeline, team totals, individual player stats, nulls/missing fields and source conflicts.
4. Coverage is calculated at metric-group and event-type level, including provider-specific player ratings.
5. Historical records are available to pre-event research without leaking the target event result into pre-event inputs.
6. Dashboard/research status shows the actual imported data and source freshness.
7. Unsupported sports, competitions, seasons and statistics remain explicitly unknown rather than being fabricated.
8. The source adapter can be paused independently if upstream terms, access, quality or schema changes.
