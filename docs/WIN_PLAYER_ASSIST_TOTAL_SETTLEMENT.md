# WIN player total-assists settlement boundary

This draft adds pure offline settlement for one football player total-assists
market. It does not infer a player's assists from goals, shots, passes, key
passes, team totals, a player name, or raw goal/assist event arrays.

## Supported rule

The helper requires an exact normalized single-market label: `Player Total
Assists`, `Total Player Assists`, or `Player Assists Total`. The leg must carry
exact bounded opaque `eventId` and `playerId` strings without spaces. Final
evidence must carry the same two identities plus:

- `scope: "regulation_time"` and `status: "final"`;
- `participationStatus: "played"`;
- `countingRule: "official_regulation_player_assist_count"`;
- a bounded non-negative safe-integer `assists` count;
- one explicit bounded whole or half numeric `line`; and
- an exact `Over` or `Under` selection.

Every settlement-critical field must be an own property of its supplied leg or
statistics record. Prototype-inherited market, line, pick/selection, event or
player identity, scope, status, participation, count basis or count is absent
for settlement purposes and fails closed. Own fields on ordinary or
null-prototype records remain supported.

Callers may use `pick` or `selection`. Each explicitly supplied field is
validated independently. If both are present, both must be non-blank exact
directions and must agree. A contradictory or malformed field cannot be hidden
by a valid value in the other.

The reviewed final assist count is compared with the line. Equality on a whole
line is `void`; other supported outcomes are `won` or `lost`.

## Fail-closed boundaries

Did-not-play and unused-substitute cases remain unsupported because bookmaker
participation and void rules are not universal. The helper never invents a
void outcome from missing participation. Raw or related goal, pass, key-pass,
assist-event or team-statistic fields supplied alongside a final count are
rejected rather than ignored.

Quarter/split lines, player names in place of exact identities, team totals,
period/half or extra-time props, goals, shots, key passes, compound labels,
appended unknown families, numeric strings and ambiguous selections fail
closed.

## Evidence and operational limits

This helper authenticates no identity, participation record, statistic, event,
provider or bookmaker rule. Requiring exact typed fields is an input boundary,
not proof that the supplied assist count or market interpretation is correct.
The score-only result checker deliberately remains unable to settle player
props.

The helper performs no provider call, odds lookup, production write, coupon
construction or betting action. Synthetic tests and CI do not prove
live-provider compatibility, real-match player-assist accuracy, participation,
assist-definition or void-rule compatibility, historical coverage,
profitability or production readiness.
