# WIN team-strength snapshot

This draft implements one disconnected C3 evidence boundary. It converts
already validated C2 final-result envelopes into a deterministic, descriptive
team-strength snapshot. It does not fetch data, train a model, produce a
probability, recommend a market, settle a wager or write persistent state.

## Required scope

The caller supplies:

- an exact `asOf`, sport, competition, season ID and season-start instant;
- exactly two distinct team IDs;
- explicit caps for result and availability evidence;
- result freshness, minimum-sample and recent-window policies; and
- optional content-addressed availability evidence.

The C2 snapshot validator first checks envelope integrity, rights, attribution,
retrieval time, freshness and batch size. Only final results for the requested
sport and competition, with event time on or after the explicit season start,
enter the strength snapshot. The freshness window is not treated as a season
definition.

## Conflict and replay policy

Accepted result envelopes are grouped by canonical event ID. The entire event
is excluded when its participant/time/competition identity differs across
providers or when providers report different final scores. Multiple providers
that agree on identity and score contribute provenance but only one match to
the aggregates, so duplicate sources cannot manufacture sample size.

Availability evidence has a separate cap. Each record carries a stable evidence
ID, source snapshot hash, observation and availability timestamps, evidence
class, expected/confirmed starter counts and count-only absence/questionable
fields. Future, malformed or impossible records are excluded. A changed replay
of one evidence ID makes the entire team's availability status `conflicted`.
An otherwise clean newer record can remain visible only as separately attributed
`latestUnconflictedEvidence` with `usableForStatus: false`; it cannot restore a
`confirmed` status while a replay conflict exists. An invalid or future version
sharing a valid evidence ID taints that ID as a conflict. Unrelated invalid
evidence degrades a clean record to `uncertain` instead of `confirmed`.
No player name, diagnosis or inferred injury is created by this module.

## Descriptive outputs

For each requested team, the snapshot reports:

- full-season W/D/L, points, points per game, goals and goal difference;
- separate home and away aggregates;
- a bounded, event-ID-linked recent window;
- average opponent points per game and the competition average; and
- availability status: `confirmed`, `uncertain`, `conflicted` or
  `not_provided`.

Availability also exposes an explicit `trustStatus`. Consumers must use the
team-level status/trust status, not infer trust from the presence of an
attributed evidence object.

The transparent schedule-context heuristic is:

`adjusted PPG = raw PPG + 0.5 × (average opponent PPG − competition average PPG)`

with output bounded to 0..3. This fixed formula is descriptive, not fitted or calibrated.
Availability never silently changes the strength value.

When either requested team has fewer than the explicit minimum sample, the
snapshot is `insufficient_evidence`. `predictiveConfidence` is always `null`.
Missing availability is not interpreted as a healthy squad, and missing match
rows are not interpreted as complete competition coverage.

## Proven and unproven

Synthetic tests prove deterministic input-order handling, immutable output,
explicit season boundaries, as-of/freshness exclusion, score and identity
conflict quarantine, agreeing-provider deduplication, full/home/away/recent
arithmetic, transparent opponent context, availability uncertainty, replay
handling, sample gates and input caps.

They do **not** prove provider correctness, complete seasons, current injuries,
confirmed real lineups, tactical strength, cross-league comparability,
calibration, forecast accuracy, profitability, durable storage or production
operation. Those remain separate evidence, modelling and validation tasks.
