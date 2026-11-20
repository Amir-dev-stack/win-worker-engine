# WIN football market settlement boundary

This draft adds deterministic, offline settlement for two football full-match
markets to the existing WIN result adapter:

- **Draw No Bet (DNB):** a selected home or away side wins or loses from the
  regulation full-time score; a draw returns `void`.
- **Double Chance:** exact `1X`, `X2`, and `12` selections win when the
  regulation result is one of the two stated outcomes.

The adapter accepts only a non-negative final home/away score and conservative,
unambiguous selection forms. It normalizes Polish diacritics and supports the
documented English/Polish labels in the unit tests. Unknown wording, a DNB draw
selection, conflicting team selections, or a Double Chance value other than an
exact supported pair returns `unsupported_market`.

## Settlement boundary

The supplied score is treated as the **90-minute regulation full-time result**.
It does not include extra time or a penalty shootout. First/second-half,
period-specific, overtime, extra-time, and shootout markets fail closed before
market evaluation.

This slice does not add Asian handicap, spread, quarter-line, cards, corners,
player-prop, abandonment, postponement, dead-heat, or bookmaker-specific rule
handling. It does not infer whether a provider includes stoppage time or uses a
different settlement convention. Those cases require explicit typed evidence
and rules before they can be supported.

## Evidence and operational limits

The evaluator is a pure result function. It does not fetch scores, odds, or
bookmaker rules; place or construct bets; mutate a database; call paid APIs; or
make a provider result trustworthy. Callers must still establish exact event
identity, an independently verified regulation score, the applicable market
rule, and separate review evidence.

Passing synthetic unit tests proves only the stated deterministic mapping. It
does not prove live-provider compatibility, historical coverage, settlement
accuracy for an actual bookmaker, profitability, or production readiness.
