# WIN evidence snapshot envelope — disconnected draft

This C2 draft defines a content-addressed envelope for one typed schedule, final-result or observed-odds fact. It is an offline validation boundary, not an ingestion job or historical database. No provider, registry runtime, storage collection, Netlify function, schedule, prediction, settlement or learning path calls it.

## Envelope contract

Each envelope requires provider and WIN canonical event identities; ordered participant and competition IDs; an exact ISO-8601 event instant with declared precision and UTC/explicit-offset basis; retrieval time; source ID/version/revision; observed-record origin; approved licence and attribution flags; and one typed payload.

- Schedule payloads bind their scheduled start to the envelope event time.
- Final-result payloads may only be retrieved at or after the event time.
- Odds payloads require a non-live decimal quote observed before the event and retrieved no earlier than observation.
- Payload and metadata hashes form a deterministic snapshot ID. Returned envelopes and nested values are frozen.

The envelope accepts audit-safe identifiers only and does not retain arbitrary provider payloads, URLs, exceptions or credentials.

## Bounded batch policy

- A batch over the configured cap is rejected whole; it is never silently truncated. The only suggested action is explicit bounded splitting, not automatic replay.
- Per-kind freshness windows and an explicit `asOf` reject stale or future retrievals.
- Exact replayed snapshot IDs count once.
- One provider event alias mapped to different canonical identities quarantines every affected snapshot.
- The same source revision with different content is a conflict. Higher revisions require strictly later retrieval times.
- Invalid, tampered, registry-candidate, rights-unknown and unattributed records never enter the accepted set.
- Accepted/rejected output is sorted and deterministic regardless of input order.

## Evidence boundary

Synthetic tests prove deterministic offline contract behavior only. They do not prove provider accuracy, live rights, historical completeness, bookmaker price availability, event identity, correct settlement or storage durability. Historical archives may configure longer result freshness windows, but must not reuse those windows for current schedules or odds.

Before integration, independently review source-specific revision semantics, canonical identity ownership, correction/retraction records, per-sport time precision, market identifiers, immutable storage transactions, retention/licensing and reviewer escalation. No existing provider or dataset is activated by this draft.
