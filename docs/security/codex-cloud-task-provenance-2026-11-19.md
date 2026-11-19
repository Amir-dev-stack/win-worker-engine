# Codex Cloud task provenance assessment

Assignment: issue #81 B1  
Status: `BLOCKED_EVIDENCE`

## Current evidence

No accessible authorized record contains a real Codex Cloud task ID/URL with repository, managed workspace, verified permissions, start/end timestamps and final state. The hourly `WIN Cloud Development` record is a ChatGPT automation identifier and is explicitly not evidence that Codex Cloud was launched. GitHub branches, commits, draft PRs and CI runs prove repository work, not the identity or lifecycle of the coding execution environment.

The current managed workspace confirms only that this session can access the checked-out repository. It does not provide a separately verifiable Codex Cloud task receipt or prove the owner's Windows PC was off. Therefore B1 is not complete and B4 remains unverified.

## Fail-closed contract

`scripts/win-cloud-task-provenance.mjs` classifies records as `LIVE_VERIFIED`, `REPORTED`, `MOCK_ONLY` or `BLOCKED_EVIDENCE`. `LIVE_VERIFIED` requires a credential-free HTTPS task URL, task ID, exact repository, workspace, ordered start/end timestamps, completed state and verified permissions from a Codex Cloud live receipt. PC-off evidence is an independent field and never follows from cloud-task provenance alone.

The validator is read-only and reports `dispatchOperations: 0`. It does not launch tasks, probe credentials, call a model, or invent URLs. A future B1 completion requires an actual platform-issued Codex Cloud task receipt available through an authorized interface.

## Separate PR #83 follow-up

The technical-lead review identified missing authorization predicates in PR #83's in-memory design model: task type, explicit approval/approved source and binding `nextHead` to the trusted inspected SHA. That revision is queued separately and is not modified on this B1 branch. It remains a design gap before any writer work.
