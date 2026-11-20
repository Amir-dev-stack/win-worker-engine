# WIN match-total cards settlement boundary

This draft adds pure offline settlement for one football match-total cards
market. It does not infer cards from a football score or derive a count from
yellow-card, second-yellow, red-card, dismissal, or booking-point events.

## Supported rule

The helper requires an exact normalized single-market label: `Match Total
Cards`, `Total Match Cards`, `Total Cards`, or `Cards Total`. Callers must also
provide:

- `scope: "regulation_time"` and `status: "final"`;
- `countingRule: "explicit_final_market_card_count"`;
- bounded non-negative safe-integer `homeCards` and `awayCards` counts;
- one explicit bounded whole or half numeric `line`; and
- an exact `Over` or `Under` selection.

The count-basis field declares that the two supplied team values are already
the final card counts for the reviewed market rule. It does not make those
values trustworthy and does not authorize the helper to construct them from
raw discipline events. A caller must independently establish how the relevant
market treats second yellows, direct reds, bench cards and booking points. Raw
yellow/red/second-yellow/card-event or booking-point fields supplied alongside
the final counts are rejected rather than silently ignored.

Callers may use `pick` or `selection`. Each explicitly supplied field is
validated independently. If both are present, both must be non-blank exact
directions and must agree. A contradictory, blank, null, undefined, or
otherwise malformed field cannot be hidden by a valid value in the other.

The two explicit team counts are added and compared with the line. Equality on
a whole line is `void`; other supported outcomes are `won` or `lost`.

Quarter/split lines remain unsupported because the current coupon outcome
model cannot represent half-win or half-loss safely. Booking points, raw card
event conversion, team/player totals, period/half, extra-time, live or partial
statistics, compound labels, appended unknown families, numeric strings and
ambiguous selections fail closed.

## Evidence and operational limits

This helper authenticates no statistic, event, provider or bookmaker rule.
Requiring `final`, `regulation_time`, and an explicit count basis is a typed
input boundary, not proof that the supplied counts or rule interpretation are
correct. The score-only result checker deliberately remains unable to settle
card markets.

The helper performs no provider call, odds lookup, production write, coupon
construction or betting action. Synthetic tests and CI do not prove
live-provider compatibility, real-match card accuracy, bookmaker-rule compatibility,
historical coverage, profitability or production readiness.
