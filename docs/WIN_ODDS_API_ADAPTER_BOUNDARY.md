# The Odds API v4 adapter boundary

WIN now has an offline-only parser for the documented v4 event-odds response shape.

- It reads event ID/sport/commence time, bookmaker key/title, market key, outcome name/description/point/price and source update timestamps.
- The market-level `last_update` is preferred; bookmaker-level `last_update` is a fallback. Retrieval time is never substituted for a missing source timestamp.
- A SHA-1 digest of the canonical observation is stored in the existing 40-hex `sourceRevision` field. This is a WIN-generated payload fingerprint, **not** a provider-issued revision.
- The parser does not make network requests, read credentials, enable the provider registry entry or write database records.
- The v4 odds response does not provide a dependable per-outcome open/suspended state. Every parsed observation is therefore marked `availabilityStatus: "unknown"` and `quoteEligible: false`. It cannot pass the executable quote normalizer, which requires explicit `open`.
- The adapter does not classify a last observed pre-kickoff snapshot as the true closing line. A future collector must retain each timestamped observation and document its sampling/close-classification policy.

The registry entry remains `licenceReview: "required"` and `automationAllowed: false`. This parser is fixture-tested only; it is not a connected provider.
