# Isolated backup-agent staging area

**This directory is NOT application code.** Nothing placed here may be loaded, deployed, imported into production, or merged automatically.

Read [WIN_BACKUP_AGENT_WORKSPACE.md](../../WIN_BACKUP_AGENT_WORKSPACE.md) for the complete owner-authorized backup/Codex-review protocol. The historical backup reviewer in PR #36 remains an unmerged, unconnected draft; this folder does not start it.

## Create a task only when authorized and safely owned

For each verified handoff, use an isolated `backup/<agent>-<issue>-<date>-<slug>` branch/worktree and create:

```text
drafts/backup-agent-workspace/
  README.md
  tasks/
    <task-id>/
      MANIFEST.md
      proposal/
        <intended-relative-source-paths>
      TEST_REPORT.md
      REVIEW.md     # added later by Codex, never pre-approved
```

For `MANIFEST.md`, include: explicit task ID; backup agent/model/runtime; verified primary handoff/lease; branch and base commit; allowed paths; design, risks, licensing, cost and privacy gates; exact proposed source destinations; actual validation and remaining blockers. Use `UNVERIFIED` where evidence is absent.

Backup agents may create code **only inside their proposal tree** and push a draft PR. They must never modify `main`, dirty Codex worktrees, frozen PR #36 or live services. Keep tests and code examples synthetic unless authorized data/source rights are verified.

On Codex return, Codex independently inspects proposals and architecture, runs exact-head integration tests from a fresh branch, and marks `ACCEPTED`, `REPAIR_REQUIRED` or `REJECTED` with reasons. Codex may only merge approved integrated code through normal authorized safety gates; the backup draft is not directly mergeable.

## Runtime reality

Ollama/OpenCode **requires an active machine** when run locally. This repo folder is not a scheduler, cloud worker, heartbeat or live backup. Automatic takeover with the owner's PC off depends on separately deploying and verifying a free authorized host and trusted single-writer lease mechanism. Until then, run a verified handoff manually and keep unproven automation claims out of progress reports.

## Financial/security controls

Zero new spend or subscriptions; no billing access, auto-recharge, secrets, private data, unverified model-provider transfers, live bets, production deploys or unreviewed merges. The WIN repo was confirmed public on 2026-11-19; recheck visibility before publishing candidates.