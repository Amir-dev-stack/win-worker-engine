# WIN European three-way handicap settlement boundary

This draft adds a pure offline rule for regulation-time European three-way
football handicaps. It never infers handicap orientation from a provider label.

## Supported rule

Callers must supply both `homeHandicap` and `awayHandicap` as bounded integer
JavaScript numbers. WIN adds those values to the verified regulation home and
away goals, derives the adjusted home/draw/away result, and settles one
unambiguous 1X2-style selection.

Score fields must also be present non-negative safe-integer numbers. Missing,
null, blank, digit-string, fractional, negative, nonfinite, malformed, or
compound values fail closed. Handicap strings, fractions, missing sides, and
values outside the documented bound fail closed as well.

The adapter deliberately does not parse notation such as `(1:0)`: providers
can encode orientation differently, and a label is not sufficient typed
settlement evidence. Period/half, extra-time, Asian/split-line, combined and
ambiguous markets remain unsupported.

## Evidence and operational limits

This helper performs only deterministic arithmetic over supplied inputs. It
does not authenticate scores, establish event identity, fetch bookmaker rules
or odds, construct or place coupons, or write production data.

Synthetic tests and CI do not prove live-provider compatibility, real-match
settlement accuracy, historical completeness, profitability, or production
readiness.
