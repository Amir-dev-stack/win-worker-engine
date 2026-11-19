# Codex Cloud capability and access matrix

Observed 2026-11-19 in the managed WIN workspace. Status: `SUPPORTED_INTERFACE_BLOCKED_ACCESS`.

| Capability | Evidence | Result |
|---|---|---|
| Hourly continuation | Issue #20 reports enabled ChatGPT cloud automations | Available scheduling, but not a Codex Cloud task or lifecycle receipt |
| Local coding CLI | `codex --version` → `codex-cli 0.167.0-alpha.4` | Installed in this managed workspace |
| Cloud submit | CLI help advertises experimental `codex cloud exec --env <ENV_ID>` | Supported interface exists; no task was submitted |
| Cloud lifecycle read | CLI help advertises `codex cloud status <TASK_ID>` and `codex cloud list --json` | Supported commands exist |
| Authentication | `codex login status` reported ChatGPT login | Reported locally; not environment entitlement or quota proof |
| Task/environment discovery | Bounded `codex cloud list --json --limit 1` | Failed with an HTTP transport error; returned no environment or task receipt |
| Network | Redacted `codex doctor --network-only --summary --ascii` | Required endpoint reachability failed; WebSocket warning also reported |
| Environment ID | No successful authorized listing | Unverified; never guess or copy one from unrelated logs |
| Task ID / URL | No successful submission or listing | Unavailable; B1 remains `BLOCKED_EVIDENCE` |
| Quota and model entitlement | No authenticated readable platform evidence | Unverified; no launch or fallback allowed |
| Task receipt contract | CLI output was not observed for a real task | Unverified; do not invent a parser or task URL |
| PC-off proof | No controlled independent test | Unverified; B4 remains open |

## Minimal supported path

The installed CLI provides the smallest identifiable supported launch path: `codex cloud exec` followed by `codex cloud status`. The dispatcher must not invoke it until a trusted host can read an authorized environment ID, verify quota/model/time budget, and map genuine submission/status output to the B1 receipt contract. This branch intentionally does not build a shell launcher around unobserved output.

No additional schedule or background daemon is needed. The existing hourly cloud automation is the only verified continuation mechanism while access is blocked. There is no confirmed owner-side setup action yet: the failure may be host networking or platform access, so asking the owner for an environment ID or credential in chat would be unsafe and premature.

`scripts/win-codex-cloud-capability.mjs` turns explicit host observations into a redacted matrix and a side-effect-free continuation decision. Deterministic tests cover completion-to-next-task, platform refusal, unknown/exhausted quota, insufficient time, duplicate dispatch, lease crash, model unavailability and interrupted outcomes. They prove policy behavior only, not a live cloud launch.

No credential was read or exposed, no model/API call was made, and no task, deployment, database write, paid service or duplicate scheduler was created.
