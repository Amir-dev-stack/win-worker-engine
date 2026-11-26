# WIN effect-class policy (draft)

This policy is a design boundary for receipt-backed execution. It does not
authorize a provider, activate a writer, or make an external side effect safe
by itself.

1. **Database-co-located transactional effects** may be completed only when
   the effect and its receipt are committed by one conditional transaction,
   using the task owner and fence as compare-and-swap inputs.
2. **External APIs with native idempotency** may be retried only with a stable
   operation key and a provider contract that guarantees duplicate requests do
   not apply the effect twice. The receipt stores the key and result, never
   credentials or raw sensitive payloads.
3. **Non-idempotent external APIs** must never be automatically replayed after
   an uncertain crash window. They require reconciliation and explicit manual
   authorization before any retry.

The local draft sink is deliberately no-op and proves only operation binding,
stale-fence rejection and logical duplicate suppression. It is not evidence of
exactly-once behavior for an external system.
