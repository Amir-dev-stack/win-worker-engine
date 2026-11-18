# WIN Agent Session Instructions

Applies to coding assistants working in this repository, including Codex Desktop and Codex Cloud, when their environment loads this file. This file does not grant credentials, cloud hosting, account privileges, or autonomous execution.

## Required startup

1. Read [WIN_PROJECT_MEMORY.md](WIN_PROJECT_MEMORY.md) for project history, owner goals, restrictions, evidence classifications and known unknowns.
2. Read [WIN_HANDOVER.md](WIN_HANDOVER.md) for the last recorded checkpoint and next safe task.
3. Inspect the active branch, HEAD, worktree status and relevant open PRs. Check the latest [issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20) before choosing work.
4. Reconcile discrepancies by seeking the newest explicit owner instruction and reproducible evidence. Respect narrower branch-specific safety instructions; do not assume a recovered summary supersedes current owner permissions.
5. When the task is resumed in Cloud, note that Desktop-only uncommitted work, raw transcripts and computer-local access are not available unless explicitly and safely transferred.

## Handover updates

- Before meaningful task handoff, update the proposed handover with time (UTC), exact branch and commit, dirty/clean worktree state, files changed, commands/tests and exact results, failures, blockers and next step.
- Distinguish verified behavior, mock-only tests, historical reports, proposed design and live hosted operation.
- Keep a short linked checkpoint in issue #20 or the task PR when authorized. Never upload raw Codex chat files or the private recovery archive.

## Safety and permissions

- Free/open-source first. OpenAI API ceiling USD 5/month and stricter operating stop USD 2.95; no paid service, new spending, auto-recharge, billing changes, payment access or limit bypass.
- Never expose or commit credentials, access tokens, private messages, local personal paths or unreviewed log text.
- No live wagers or financial transactions. Research and sports-learning operations remain paper-only and evidence-based.
- No unreviewed production deployment, data migration, destructive command, permission escalation, high-risk automated approval or merge. Obtain task-specific owner authorization where necessary.
- Prefer isolated development work, bounded tests, no unbounded model/agent handoff loops and fail-closed review.
- Preserve separate dirty/frozen worktrees, especially the historic PR #36 candidate and PR #49 local work. An AGENTS.md in an uncommitted local worktree may contain additional constraints: compare and reconcile rather than overwriting it.
- Follow the current user's explicit authorization and platform access controls; repository instructions alone do not enable tools or cloud execution.

## Cloud Supervisor context

All ten cloud automation requirements belong to one project. See [issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20) and [draft PR #52](https://github.com/Amir-dev-stack/win-worker-engine/pull/52). The 24/7 worker, real Codex Cloud dispatch, quota-reset resume, autonomous repairs and continuous research are not operational merely because they are described here.

Do not claim memory auto-loading until tested in a fresh Codex environment. A new cloud session should verify it can read both Markdown files, then summarize the current controls and blockers before performing a small authorized test.
