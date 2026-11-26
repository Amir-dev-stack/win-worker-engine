# WIN effect-class policy (draft)

The PostgreSQL receipt adapter is a conditional-write boundary only. A receipt
row is not proof that an external effect happened exactly once.

- Database-co-located effects must commit the effect and receipt in one
  conditional transaction using the owner and fence.
- External APIs must provide stable operation-key idempotency before automatic
  retry is considered.
- Non-idempotent external APIs require reconciliation and explicit manual
  authorization after an uncertain crash window; they are never replayed
  automatically.

The disposable Neon verification for this draft used no application writer,
no production branch and no external effect.
