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

- New assignments default to manual execution, zero billable model calls and a zero-dollar budget ceiling. The manager does not invoke an LLM, scheduler, sandbox, shell or external tool.
- Assignment creation is not approval. Only the recorded owner can approve.
- Claims use conditional ETag writes and expiring leases to prevent two workers from owning the same assignment.
- Submissions are written to `library/research-submissions` with `untrusted_pending_review`; source URLs and artifact digests are validated.
- Independent challenge and review are required to move a submission out of pending review. The submitter cannot review their own work.
- Acceptance means accepted research, **not** trusted knowledge promotion. Promotion to WIN's trusted knowledge, code, model or strategy requires a separate owner-controlled workflow that is not implemented here.
- No endpoint here can place bets, update coupon decisions, promote a model, change the AI budget, or enable scheduled execution.

## Pilot assignments

Create these as proposed assignments first, approve them deliberately, and assign local/manual execution:

1. Football odds timestamp and event-identity pipeline audit.
2. Chronological walk-forward evaluation harness and market-baseline comparison.
3. Accumulator joint-probability and correlation simulation.
4. Provider timeout, duplicate-task and uncertain-budget failure drills.

Use only public/licensed, owner-provided or synthetic data. Keep synthetic records separate from real observations. Record dataset hashes, time cut-offs, exact commands, Brier score, log loss, calibration, CLV where relevant, sample size and limitations.
