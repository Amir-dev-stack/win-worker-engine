# Durable task dispatcher groundwork

Assignment: issue #81 B2  
Status: `BLOCKED_INTERFACE`

The dispatcher persists an idempotent queue, uses an exclusive local writer lock, applies explicit approval/quota/free-only gates, caps attempts, dead-letters missing receipts and records only fixed trace codes. It can call a launcher only when the host marks an interface verified and live. A returned task is accepted only through the B1 provenance validator.

The current environment has no verified Codex Cloud launch interface, so actual dispatch is disabled and the observed result is `BLOCKED_INTERFACE / VERIFIED_LAUNCH_INTERFACE_UNAVAILABLE`. The implementation does not invent task URLs or treat ChatGPT automation as Codex Cloud. Local-file durability is not cross-host durability; PostgreSQL/distributed takeover belongs to B3.
