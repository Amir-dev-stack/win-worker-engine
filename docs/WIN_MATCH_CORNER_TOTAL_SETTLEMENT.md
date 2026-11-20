# WIN match-total corners settlement boundary

This draft adds pure offline settlement for one football match-total corners
market. It does not infer corners from a football score.

## Supported rule

The helper requires an exact normalized single-market label: `Match Total
Corners`, `Total Match Corners`, `Total Corners`, or `Corners Total`. Callers
must also provide:

- `scope: "regulation_time"` and `status: "final"`;
- bounded non-negative safe-integer `homeCorners` and `awayCorners` counts;
- one explicit bounded whole or half numeric `line`; and
- an exact `Over` or `Under` selection.

Callers may use `pick` or `selection`. Each explicitly supplied field is
validated independently. If both are present, both must be non-blank exact
directions and must agree. A contradictory, blank, null, undefined, or
otherwise malformed field cannot be hidden by a valid value in the other.

The two team counts are added and compared with the line. Equality on a whole
line is `void`; other supported outcomes are `won` or `lost`.

Quarter/split lines remain unsupported because the current coupon outcome
model cannot represent half-win or half-loss safely. Team totals, period/half,
extra-time, live or partial statistics, compound labels, appended unknown
families, numeric strings and ambiguous selections fail closed.

## Evidence and operational limits

This helper authenticates no statistic, event or provider. Requiring `final`
and `regulation_time` is a typed input boundary, not proof that the supplied
counts are correct. The score-only result checker deliberately remains unable
to settle corner markets.

The helper performs no provider call, odds lookup, production write, coupon
construction or betting action. Synthetic tests and CI do not prove
live-provider compatibility, real-match corner accuracy, historical coverage,
profitability or production readiness.
