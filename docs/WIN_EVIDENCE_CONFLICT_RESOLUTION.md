# WIN evidence conflict resolution — offline draft

This draft defines a pure, disconnected resolver for synthetic multi-source observations. It does not fetch, ingest, store, schedule or activate any provider. Passing tests prove only deterministic policy behavior on in-memory fixtures; they do not prove live source identity, data correctness, rights, coverage, freshness or settlement.

## Required observation contract

Every observation carries:

- a provider ID plus provider-owned event ID and an explicit WIN canonical event ID;
- canonical sport, competition and ordered participant IDs;
- event time separately from retrieval time, both timezone-qualified;
- an observation ID, source ID and source version;
- observed-record versus registry-candidate origin;
- explicit rights status, licence ID and attribution flags;
- either a final event result or an exact market/selection settlement.

Only audit-safe identifiers are returned. Arbitrary payloads, URLs, exception text and credentials are neither accepted as provenance nor echoed.

## Fail-closed policy

- Registry candidates are metadata, never evidence.
- Unknown/blocked rights, missing attribution, invalid fields, undated rows, retrieval before the event, future retrieval and stale rows are rejected.
- A provider-scoped event alias mapped to multiple canonical identities blocks resolution.
- Exact duplicates and same-provider replays count once; a reused observation ID with changed content is rejected.
- A resolution needs the configured minimum number of independent providers agreeing on the same typed claim.
- Contradictory final results and conflicting settlements remain unresolved. Explicit provider priority may identify a deterministic preferred candidate for review, but never turns a conflict into truth. A priority tie has no preferred candidate.
- Output ordering is stable, so permuting input observations does not change the result.

## Proven and unproven

The deterministic tests cover agreement, missing independent support, timestamp failures, replays, contradictory results, conflicting settlements, alias collisions, rights-unknown rows, registry candidates and input-order invariance. The implementation is not connected to `match-evidence.mts`, the provider registry, any Netlify function, storage, scheduler, prediction, settlement or learning path.

Before any integration, independently define canonical-identity governance, source-priority ownership, sport/market-specific freshness windows, correction/retraction handling, live licence verification and an external review path for unresolved conflicts. No existing source is authorized or made live by this draft.
