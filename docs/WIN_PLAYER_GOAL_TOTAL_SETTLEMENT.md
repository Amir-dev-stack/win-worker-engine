# WIN player total-goals settlement boundary

This draft adds pure offline settlement for one football player total-goals
market. It does not infer a player's goals from the team score, a player name,
provider wording, goal-event arrays or scorer lists.

## Supported rule

The helper requires an exact normalized single-market label: `Player Total
Goals`, `Total Player Goals`, or `Player Goals Total`. The leg must carry exact
bounded opaque `eventId` and `playerId` strings without spaces. Final evidence
must carry the same two identities plus:

- `scope: "regulation_time"` and `status: "final"`;
- `participationStatus: "played"`;
- `countingRule: "official_regulation_player_goal_count"`;
- a bounded non-negative safe-integer `goals` count;
- one explicit bounded whole or half numeric `line`; and
- an exact `Over` or `Under` selection.

Every settlement-critical field must be an own property of its supplied leg or
statistics record. Prototype-inherited market, line, pick/selection, event or
player identity, scope, status, participation, count basis or goal count is
absent for settlement purposes and fails closed. Own fields on ordinary or
null-prototype records remain supported.

Callers may use `pick` or `selection`. Each explicitly supplied field is
validated independently. If both are present, both must be non-blank exact
directions and must agree. A contradictory or malformed field cannot be hidden
by a valid value in the other.

The reviewed final goal count is compared with the line. Equality on a whole
line is `void`; other supported outcomes are `won` or `lost`.

## Fail-closed boundaries

Did-not-play and unused-substitute cases remain unsupported because bookmaker
participation and void rules are not universal. The helper never invents a
void outcome from missing participation. Raw score, goal-event and scorer-list
fields supplied alongside a final count are rejected rather than ignored.

Quarter/split lines, player names in place of exact identities, team totals,
period/half or extra-time props, other player statistics, anytime-goalscorer
markets, compound labels, appended unknown families, numeric strings and
ambiguous selections fail closed.

## Evidence and operational limits

This helper authenticates no identity, participation record, statistic, event,
provider or bookmaker rule. Requiring exact typed fields is an input boundary,
not proof that the supplied evidence or market interpretation is correct. The
score-only result checker deliberately remains unable to settle player props.

The helper performs no provider call, odds lookup, production write, coupon
construction or betting action. Synthetic tests and CI do not prove
live-provider compatibility, real-match player-goal accuracy, participation or
void-rule compatibility, historical coverage, profitability or production
readiness.
