# WIN Autonomous Data Discovery and Model Learning

## Mission
WIN must discover and learn from external sports information independently of user-supplied examples. User examples are optional terminology and QA fixtures only; they are not a required feed or a source of model truth.

## Data acquisition
1. Discover providers and datasets from public provider documentation, open-data repositories and authorized directories.
2. Register each provider with its sports, domains, access mode, historical support, authentication, licence review and automation status.
3. Review terms, permitted use, retention and redistribution rights before enabling an adapter.
4. Connect adapters using server-side environment credentials. Never expose API keys in browser code or logs.
5. Preserve raw source payloads and checksums; normalize into canonical event, participant, competition, market, odds, statistic and result records.
6. Record source ID, provider ID, retrieval time, event time, timezone, licence reference, schema version and quality checks.
7. Monitor missing coverage, stale feeds, schema changes, quota, failures and provider availability.

A provider in the registry is only a candidate. It is not connected, licensed, or verified until a successful authorized adapter test and terms review are recorded.

## Autonomous discovery
Scheduled discovery should:
- refresh the provider directory and public documentation sources;
- identify new datasets, endpoints, sports, competitions, markets and historical archives;
- create review tasks for new providers or changed terms;
- propose adapter work and schema mappings;
- never activate an unreviewed source or purchase a subscription automatically.

Automated collection is permitted only through documented APIs, compatible open datasets, licensed feeds or authorized exports. No private-group access, credential sharing, CAPTCHA/paywall bypass, or evasion of provider controls.

## Model Lab
The Model Lab uses provider historical data, WIN's frozen pre-event predictions, verified event results and WIN-generated simulation records. It must enforce time-aware train/validation/test splits and prevent post-event information from entering pre-event features.

Every prediction is frozen with its timestamp, data snapshot, model/agent version, market, selection, line, odds and probability. Settlements require authoritative event/market evidence. Experiments report calibration, Brier/log loss, ROI, closing-line value where available, drawdown, sample size and uncertainty.

## Agent evolution
Agents may identify gaps and propose specialist agents. New agents are sandboxed, versioned and tested against chronological out-of-sample data. They cannot self-approve, self-promote or overwrite their parent. Failed experiments and their reasons remain in the archive. Production promotion requires independent review.

## Strict Human Coupon Lab isolation
Human coupons, tipster picks, community consensus and bookmaker promotions are stored in a separate namespace. They cannot enter Model Lab training, agent scorecards or WIN prediction attribution. Cross-lab comparisons are read-only and labelled. This boundary must be enforced in code and tests, not just prompts.

## Cost controls
Use open datasets first, cache API responses, use incremental sync, respect provider quotas, and avoid unnecessary AI calls. Do not buy data or enable paid APIs without explicit budget approval. Scheduled coverage checks should be deterministic and non-AI where possible.

## Initial provider candidates
See `netlify/lib/data-provider-registry.mts`. Registration does not imply access or a licence. Each provider requires review and a working adapter before activation.
