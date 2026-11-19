# Server-atomic draft ref update investigation

Incident: `WIN-INC-20261119-GITHUB-ATOMIC-REF-CAS`  
Status: design and deterministic model only; external writer disabled

A client sequence of GET current ref followed by PATCH is not compare-and-swap. Another writer can change the ref between those requests, and GitHub's ordinary update-ref endpoint does not accept an expected-old-SHA predicate. Therefore the current read-only preflight must never be described as an atomic writer authorization.

The prospective protocol requires one trusted server transaction to own all of these predicates and effects: operation ID unused or exactly replayed; expected old head equals current head; lease owner/fence is current; lease is not expired or revoked; proposed commit is the separately approved head; then update the isolated scratch ref and persist the receipt atomically. A lost response is retried by operation ID and returns the stored receipt. Changed intent under the same operation ID is quarantined. Rollback is a new reviewed transaction, never an automatic blind PATCH.

`win-server-atomic-ref-cas.mjs` is an in-memory deterministic protocol model, not a GitHub adapter. It contains no HTTP transport and exports `GITHUB_REF_WRITER_ENABLED = false`. Tests cover two-writer contention, old-head mismatch, stale fence/owner, expiry, revocation, lease takeover, crash before commit, lost acknowledgement after commit, idempotent receipt recovery and conflict quarantine.

Before any real prototype, an independently reviewed backend must provide a true conditional transaction (for example, a service controlling both lease state and scratch-ref namespace). If the external Git host cannot enforce expected-old-head atomically, the design must use a server-owned serialization layer and reconcile the external ref under quarantine; it must not claim the host PATCH is CAS. Activation, GitHub writes and even scratch-ref testing require separate authorization after A2-A4 evidence.
