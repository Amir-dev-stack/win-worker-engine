# WIN odds collection ledger contract

## Purpose
The collection ledger records every planned or attempted odds poll independently of quote-evidence tables. It is an audit contract only: no network requests, storage writes, key access, provider activation or quota reservation.

## Required record
Each immutable attempt records provider and licence identity; sport, markets and regions; planned, request and ingestion timestamps; outcome; provider usage headers (x-requests-used, x-requests-remaining, x-requests-last); estimated and actual credits and variance; correlation ID, optional response SHA-256, returned record count and source timestamp range; stop reason and owner-review requirement.

Only safe accounting metadata is retained. API keys, authorization headers, cookies and raw credentials are not fields in this contract. A future persistence layer must use append-only insert semantics and reject update/delete.

## Stop policy
Further collection stops on provider rate limiting or quota exhaustion, provider errors requiring review, missing usage headers on a completed request, remaining credits below the protected reserve, actual usage above the preflight estimate, or a request marked not attempted. Missing headers are unknown, never zero.

## Timestamp and evidence policy
Source observation timestamps remain distinct from planned, request and ingestion times. A last-observed pre-match snapshot is not automatically the true closing line. Quote eligibility remains governed by the existing quote normalizer and evidence database constraints.

## Activation boundary
The Odds API registry entry remains licence-review-required and automation-disabled. This contract does not connect a provider, schedule a collector, write to Neon/Blobs, or enable betting. A future collector requires separate owner approval, verified account quota, licence review, secret configuration and persistence design.
