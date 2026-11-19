# StatsBomb Open Data reader reconciliation

This branch extracts only the research-only StatsBomb JSON reader from stale mixed draft PR #49 onto current main. It deliberately excludes PR #49's database migration, credentialed API-Football preview endpoint, token handling and report scripts.

The reader supports fixed competitions, competition-season matches, events and lineups paths. Positive numeric identifiers prevent arbitrary URL selection. A 5 MB maximum response and a single deadline capped at 30 seconds bound fetch, streamed reads and fallback `arrayBuffer()` consumption even when an injected dependency ignores `AbortSignal`. An explicit accepted JSON/plain-text content type is required; missing metadata fails closed. Streaming cancellation is best-effort and never awaited, so a non-cooperative injected fetcher or stream may retain resources after the caller receives the fixed deadline diagnostic. JavaScript cannot forcibly terminate an arbitrary injected promise. Returned records carry provider/source URLs, retrieval time, `researchOnly: true`, `licenceReviewRequired: true`, `attributionRequired: true`, `usageApprovalGranted: false` and no freshness guarantee.

This code is disconnected: it is not called by a scheduled function, storage adapter or production route. Tests inject fake responses; they do not download StatsBomb data. The provider registry still has `automationAllowed: false` and licence review required. Before any future ingestion, independently verify the current Hudl/StatsBomb open-data terms, required attribution, competition/season coverage, update cadence, intended-use rights and a provenance-preserving storage design.

No credential, paid service, migration, external data fetch, deployment or production write is part of this reconciliation.
