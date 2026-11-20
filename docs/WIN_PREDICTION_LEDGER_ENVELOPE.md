# WIN prediction-ledger envelope

This draft defines a disconnected, provider-neutral record boundary for C4.
It is not a database, append-only storage implementation, production prediction
service, settlement service, model-training pipeline or claim of predictive
quality. It performs no network, provider, AI, storage or betting operation.

## Prediction record

`win.prediction-ledger.v1` binds one prediction to:

- a stable ledger key and canonical event, sport and competition identity;
- timezone-qualified event, information-cutoff and prediction timestamps;
- producer, source-code hash, model ID/version, artifact hash and the model's
  exclusive training boundary;
- versioned market, selection and settlement-rule identity;
- probability and optional bookmaker-observed decimal price;
- one to 100 content-addressed feature snapshot references, each with its
  observation time and the time it became available to the prediction process.

The record ID is a deterministic SHA-256 digest of canonical JSON. Feature
references are sorted before hashing, and the returned object is deeply frozen.
An exact replay is therefore deduplicable. A changed record reusing the same
ledger key is a conflict, and every version of that key is quarantined.

## Point-in-time boundary

The validator rejects the record unless:

1. `trainedThrough < informationCutoff <= predictionTime < eventTime`;
2. every feature satisfies `observedAt <= availableAt <= informationCutoff`;
3. an input price satisfies the same observation/availability boundary; and
4. every timestamp is a calendar-valid ISO-8601 instant with `Z` or an explicit
   numeric offset.

`availableAt`, not merely the source event time, controls whether information
was actually available. This prevents a later-published correction or result
from being backdated into a pre-event feature set. The envelope cannot itself
prove that a producer reported availability honestly; durable ingestion and
independent provenance verification remain separate gates.

## Verified outcome record

An outcome binds `won`, `lost`, `void` or `push` to the exact prediction ID,
event, result snapshot, settlement-rule version, evidence hash, result
observation time and independent verifier. Batch validation fails closed when:

- the exact prediction is missing from the batch and from explicitly supplied,
  already validated prior predictions;
- the event or settlement rule differs;
- the result predates the event; or
- the verifier is the prediction producer.

The outcome format does not implement or infer market settlement. A separate
reviewed market-specific component must produce the result and evidence hashes.
Strings identifying a prior prediction are insufficient: callers must supply a
complete content-verified prediction envelope.

## Bounded batch behavior

- The caller selects a positive batch limit no greater than 500.
- Oversized batches are rejected as a whole with
  `split_batch_no_automatic_replay`.
- Exact record replays are deduplicated.
- Tampered and malformed records return only fixed diagnostics and safe record
  IDs; rejected input payloads are not echoed.
- Conflicting ledger keys, missing predictions and settlement mismatches are
  quarantined. Independent clean records may remain accepted.
- Accepted/rejected output and diagnostics are deterministically sorted.

## Proven and unproven

Synthetic tests prove deterministic identity, in-memory immutability, strict
timestamp parsing, cutoff enforcement, replay/conflict behavior, outcome
reference checks, bounded batches, stable ordering and redacted rejection.

They do **not** prove durable immutability, database concurrency, source rights,
live odds capture, complete market rules, independent real-world result review,
model calibration, profitability, production operation or historical coverage.
Those require separately reviewed storage, ingestion, market settlement and
evaluation work before this boundary can be called a historical ledger.
