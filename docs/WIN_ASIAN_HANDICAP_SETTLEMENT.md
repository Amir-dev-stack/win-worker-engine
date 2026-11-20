# WIN Asian handicap settlement boundary

This draft reconciles the existing observed-market Asian handicap calculation
with WIN's shared pure result adapter. Both paths use one deterministic helper
for a selected football side and a regulation full-time score.

## Supported rule

- The line is attached to the selected side, not inferred from a provider's
  home-oriented display.
- The line must be supplied as a finite numeric `line` field or as one signed
  value in the selection, such as `Home -0.5` or `Away +1.0`.
- Whole and half lines are supported. The selected side's adjusted margin is
  `selected goals - other goals + line`.
- A positive adjusted margin is `won`, a negative margin is `lost`, and zero is
  `void`.

Quarter lines and any other split line remain unsupported because they can
produce half-win or half-loss outcomes that WIN's current coupon outcome model
cannot represent safely. European three-way handicap, period/half markets,
extra time, compound markets, ambiguous sides or lines, and provider-specific
display conventions also fail closed.

## Evidence and operational limits

This is a pure offline score mapping. It does not fetch or authenticate a
score, infer a bookmaker's line orientation, validate event identity, acquire
odds, construct or place a coupon, or write production data. Historical
observed-price settlement may call the helper only after its separate event and
pre-match evidence checks.

Synthetic tests and CI demonstrate only deterministic whole/half-line behavior.
This evidence does not prove live-provider compatibility, real-match settlement
accuracy, historical completeness, profitability, or production readiness.
