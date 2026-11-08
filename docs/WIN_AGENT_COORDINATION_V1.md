# WIN multi-agent coordination — V1 proposal

Status: **draft, no runtime wiring**. This is an incremental extension of the already-present research assignment system; it is not a new parallel assignment database.

## Existing components and evidence

- `netlify/lib/win-research-assignment-manager.mts` already defines **R1–R8**, owner-created assignments, explicit approval, independent reviewer identity, bounded model/tool budgets, leased claims, and artifact submission. The existing manager remains authoritative.
- `scripts/win-local-agent-runner.mjs` already implements a separate local research-runner path, with an explicit token, agent ID, Ollama loopback address restriction and limited source fetch. This proposal **does not** activate that runner.
- Draft PR #28 adds an isolated GitHub issue #26 one-shot bridge, which the owner locally verified using `ollama/qwen2.5-coder:7b` in a tool-disabled smoke test. That test **does not** authorize arbitrary remote task text or autonomous local execution.

## Proposed responsibilities

1. **Supervisor / dispatcher (deterministic control plane):** validate assignment state and policy, select an explicitly configured R1–R8 division and local model, produce a plan for further review. Never grant new permission itself.
2. **Research agents (data plane, future):** independently perform bounded assignments using allowlisted sources and structured evidence with provenance. LLMs extract, clean, classify and summarize; they do not manufacture calibrated betting probabilities.
3. **Data-quality reviewer:** detect stale timestamps, source gaps, licensing restrictions, leakage and inconsistent labels before modeling.
4. **Statistical/evaluation worker:** walk-forward time-split assessment, closing-odds baseline, log loss, calibration and CLV. No deployment without independently verified improvement.
5. **Independent reviewer / owner:** approve promotion of researched material and any move from plan-only to writing, integration, or deployment.

## Delivered now (pure policy, no runtime effects)

- `scripts/win-agent-coordination-policy.mjs`: `planLocalResearchTask(assignment, requested)` returns a **proposal only**, with no I/O. It rejects non-R1–R8 divisions, absent owner approval, same-person review, missing task bounds, nonzero task budget, nonlocal model selection, non-allowlisted action and non-denied permissions.
- `scripts/win-agent-coordination-policy.test.mjs`: deterministic contract checks for allowed planning and fail-closed rejections.

**Important limitations:** GitHub comments, agent output and source documents are untrusted. Word filtering in this early policy is not an authorization mechanism and cannot detect every sensitive request or prompt injection. The runtime must independently authenticate identity/approval and enforce leases, path allowlists, OS-level process restrictions, network egress restrictions, tool permissions, budgets and audit logs. OpenCode Plan mode and model permission settings are not operating-system sandboxes.

## Next verification / integration gates

1. Run `node --test scripts/win-agent-coordination-policy.test.mjs` and `node scripts/win-verify-local.mjs` in isolated WIN-Agent after reviewing the new branch; record exact results.
2. Review policy with existing assignment manager semantics (status changes, lease expiry and independent review) before connecting to any executor.
3. Implement a structured signed/reviewed assignment envelope with replay-resistant IDs and bounded retries; never turn GitHub comment bodies into shell commands.
4. Introduce fixture-based source extraction with citations; run offline. Do not expose personal files, secrets, tokens, payment methods or production credentials.
5. Only then trial a **single** supervised research assignment with the local Ollama model, read-only and with an explicit stop condition.
6. Review statistical evaluation against bookmaker closing odds before any prediction agent is considered deployable.

## Hard boundaries

No paid providers, billing, betting, uncontrolled web crawling, credentials, unrestricted shell, repository write agent, merge, push, deployment or production activation as part of this proposal. Preserve the original `WIN` checkout and its dirty worktree. Local work runs only when the owner's machine is active and the process is running; nothing here creates a 24/7 service.
