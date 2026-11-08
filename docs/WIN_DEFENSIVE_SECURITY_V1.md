# WIN Defensive Cybersecurity Division — v1 draft

Status: **proposal and read-only offline prototype**. Not a running agent, antivirus, firewall, endpoint monitor, or guaranteed protection against intrusion.

Owner request: defend the private WIN project and help protect the owner's Windows PC and unfamiliar downloads. The responsibilities are separated deliberately: **the cloud repo auditor cannot protect Windows downloads**, and local Windows security tools require setup and operator consent.

## Agent separation

| Role | Scope | Permitted | Denied |
|---|---|---|---|
| WIN Security Observer | WIN GitHub / project configuration | Bounded read-only configuration analysis | Credentials, billing, unrestricted shell, production mutation |
| Threat Assessor | Observer findings | Verify evidence and prioritize risks | Reproduce attacks on third-party infrastructure |
| Mitigation Proposer | Reviewed findings | Write suggested patches in isolated draft branches | Merges, deploys, weakened security checks |
| Independent Security Reviewer | Evidence and draft proposals | Accept/reject recommendations with rationale | Self-approving risky changes |
| Endpoint Safety Reporter (future) | Owner's local Windows Security status, opt-in | Read-only Windows Defender and Firewall state, concise local redacted results | Download execution, antivirus disabling, deleting/quarantining files, admin privileges, data uploads |

None of the agent roles is active solely because this document exists.

## Source-only prototype

Run manually from a WIN repository checkout with Node.js:

```powershell
node scripts/win-defensive-security-audit.mjs
node scripts/win-defensive-security-audit.mjs win-quality.yml win-netlify-validation.yml
node --test scripts/win-defensive-security-audit.test.mjs
```

Only existing explicit workflow filenames are read. Unknown/nonexistent inputs are **INCOMPLETE**, not reported as secure. Findings are heuristic; evaluate all findings manually. The script reads the local `package.json` and optionally exact workflow files. It never crawls your PC, accesses `.env`, watches downloads, invokes network/API requests, changes files, runs other programs, starts scheduled tasks, or writes memory. Its JSON is a **local report**, not a cloud alert. Don't place sensitive local path names or reports containing private information into public issue comments.

### Detection scope v1

- GitHub Actions `permissions: write-all` (high-severity review).
- `pull_request_target` use (manual high-priority configuration review; depends on job contents).
- Non-full-commit pinned third-party actions (review).
- Manifest dependencies with `latest`, `*`, insecure HTTP VCS specification (review).
- Malformed/unreadable configuration and invalid workflow filenames (unknown/incomplete).

This is not a full YAML, SCA, malware, network intrusion, or secret scanning tool. Later expand with legitimate existing GitHub security features and metadata-only access. Avoid printing secrets; report only redacted locations.

## Windows PC — immediate baseline

1. Open **Windows Security > Virus & threat protection** and confirm Microsoft Defender real-time protection is enabled and up to date.
2. Under **Firewall & network protection**, check firewall is enabled for active network profiles.
3. Under **App & browser control**, enable appropriate reputation-based protection / Microsoft Defender SmartScreen and potentially unwanted app blocking.
4. Keep Windows and browsers updated. Use least privilege and MFA (especially GitHub and cloud accounts).
5. Download installers from verified official publishers. Confirm file source/publisher/signature where possible; right-click unfamiliar downloaded file to **Scan with Microsoft Defender** before opening.
6. Do not run suspicious files, enable Office macros or run downloaded PowerShell scripts just to inspect them. Do not disable security protections to make tools install.
7. If an infection is detected, follow built-in Windows Security guidance; disconnect from the network if an active incident is suspected, and preserve evidence without uploading secrets.

Future optional local endpoint reporter should only collect a minimal boolean/security-version snapshot by owner-triggered commands, default to no persistent monitoring, and get explicit approval before any scheduling or sharing. It must never scan private documents or upload downloads by default.

## Reporting and incident response

Every WIN finding should distinguish `observed` from `suspected` and include check time, affected scope, severity, source evidence/line, next step, owner action and review outcome. Avoid personal files, raw logs, API tokens and credentials. Trusted memory should store **redacted**, independently verified findings with limited retention; unverified agent text stays untrusted and separate.

Future escalation levels: critical confirmed credential leak/ongoing intrusion, high actionable permissions/security regression, medium review, informational. Alerts need a tested delivery mechanism; **none is activated by this PR**.

## No-cost / safety rules

- Use native Windows Defender and existing GitHub capabilities where eligible before introducing vendors.
- No new cloud or paid subscriptions, no external scanners uploading source, no off-machine security telemetry without opt-in.
- All code and policy changes as **draft pull requests**, independent review first, no merge or production deployment by agents.
- No broad read permissions for browser profiles, passwords, local user folders, payment details or arbitrary downloads.
- A Windows PC must be on for local protections/reporters to execute; cloud WIN agents can review GitHub when explicitly scheduled but cannot protect an offline machine.
- No guarantee of '100% protection'; maintain backups, credentials hygiene and incident procedures.

Tracked development assignments: [#24 WIN independent security architecture audit](https://github.com/Amir-dev-stack/win-worker-engine/issues/24) and [#32 Defensive cybersecurity agents and Windows downloads](https://github.com/Amir-dev-stack/win-worker-engine/issues/32).

## Acceptance before activation

1. Run focused tests on exact PR head; run full WIN test/quality/build suites on a clean separate worktree.
2. Independent review of static-analysis accuracy, false positives, symlink/path containment, output data minimization and performance limits.
3. Confirm existing Defender, Windows Firewall and application reputation protections separately on the owner's PC; do not claim remote visibility.
4. Agree alert severity and routing; test redaction and least privilege.
5. Only then consider manually approved scheduled read-only checks.
