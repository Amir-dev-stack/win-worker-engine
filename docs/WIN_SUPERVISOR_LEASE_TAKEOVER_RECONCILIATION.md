# Supervisor and fenced-lease reconciliation

Assignment: issue #81 B3  
Base: PR #76 fenced-lease authorization recheck  
Evidence: deterministic offline composition; not a live PostgreSQL or PC-off test

This branch composes the PR #72/#76 lease contract with a provider-neutral supervisor cycle instead of creating another scheduler. The cycle claims only `draft_only_development`, renews immediately as heartbeat and fencing recheck, respects cancellation before effects, requires an idempotent operation sink, checkpoints and completes under the same owner/fence.

Deterministic tests cover simultaneous two-worker claim, takeover/stale fencing, approval revocation, cancellation, lost acknowledgement and reconciliation without duplicate effects. Unknown effect acknowledgement returns `EFFECT_ACK_UNKNOWN_QUARANTINE_REQUIRED`; it is not blindly replayed.

Limitations: the tests use an in-memory lease/store and effect ledger. The existing opt-in local PostgreSQL test remains separate and no database was accessed here. Cross-process PostgreSQL heartbeat, cancellation, crash recovery and durable effect idempotency still require an authorized isolated test database. No schema migration, Neon credential, GitHub writer or production side effect is enabled. B3 remains incomplete until that evidence exists.
