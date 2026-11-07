# WIN Research Assignment Manager

The first assignment-manager implementation is a bounded, authenticated workflow over the existing WIN Blobs store.

## API

- `GET /api/research-assignments`: bounded queue and inbox counts.
- `POST /api/research-assignments` with `action=create`: creates a **proposed** assignment. Required fields: title, division R1-R8, objective, acceptanceCriteria, sourceScope, dataRestrictions, expectedArtifacts and independentReviewerId.
- `action=approve`: assignment owner approves the proposed scope.
- `action=claim`: an agent claims an approved assignment and receives a short lease.
- `action=submit`: the lease holder submits findings, limitations, HTTPS evidence and a SHA-256 artifact manifest.
- `action=challenge`: the designated independent reviewer records objections and a reproduction/verification report.
- `action=review`: the designated independent reviewer accepts or rejects with written rationale.

All requests require the existing WIN internal authentication. `actorId` is an authenticated workflow identity supplied by the caller; deployments must map it to a verified service or human identity before enabling untrusted callers.

## Trust and execution boundaries

- New assignments use provider-neutral execution mode, with defaults of 3 model calls, 4 tool calls and a USD 0.15 task ceiling (owner-configurable up to USD 0.50). These are task-level limits, not permission to bypass the global WIN budget. The staged OpenAI executor reserves against the existing global budget before its model call and reconciles model plus hosted-tool usage. The local Ollama runner uses no cloud inference credits. Cloudflare/Gemini adapters require explicit free-tier and billing confirmation. No executor starts a recurring scheduler.
- Assignment creation is not approval. Only the recorded owner can approve.
- Claims use conditional ETag writes and expiring leases to prevent two workers from owning the same assignment.
- Submissions are written to `library/research-submissions` with `untrusted_pending_review`; source URLs and artifact digests are validated. Each submission also creates private persistent memory for its originating agent.
- Independent challenge and review are required to move a submission out of pending review. The submitter cannot review their own work.
- Independent acceptance makes the finding available in shared research-network memory for other agents. It is still not trusted WIN knowledge: promotion to WIN's validated lessons, code, model or strategy requires a separate owner-controlled workflow.
- No endpoint here can place bets, update coupon decisions, promote a model, change the AI budget, or enable scheduled execution.

## Pilot assignments

Create these as proposed assignments first and approve them deliberately. Available staged execution paths are the bounded OpenAI assignment endpoint and the local Ollama polling runner. Cloudflare/Gemini adapters are opt-in and not yet connected to assignment execution. All paths require deployment and owner-side configuration before use:

1. Football odds timestamp and event-identity pipeline audit.
2. Chronological walk-forward evaluation harness and market-baseline comparison.
3. Accumulator joint-probability and correlation simulation.
4. Provider timeout, duplicate-task and uncertain-budget failure drills.

Use only public/licensed, owner-provided or synthetic data. Keep synthetic records separate from real observations. Record dataset hashes, time cut-offs, exact commands, Brier score, log loss, calibration, CLV where relevant, sample size and limitations.


## Staged execution endpoints

- `POST /api/research-openai-execute`: runs one approved assignment through the existing OpenAI Agents SDK learning researcher. Requires `WIN_RESEARCH_OPENAI_EXECUTOR_ENABLED=true`, an allowlisted agent ID, the existing `WIN_AI_BUDGET_APPROVED` gate, API credentials and the global budget unlock.
- `POST /api/research-runner`: dedicated token-authenticated local Ollama runner endpoint. Requires `WIN_RESEARCH_RUNNER_ENABLED=true`, a separate high-entropy token and a server-side agent allowlist.
- Both endpoints claim only approved assignments, submit into the untrusted inbox, and preserve independent review before shared-memory promotion.
- Neither endpoint schedules itself, places bets, changes production code or promotes model strategies.
