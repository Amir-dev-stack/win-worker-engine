# WIN secret safety and provenance audit

Date: 2026-11-19  
Assignment: issue #81 A2 / issue #43  
Evidence class: local read-only scan of legitimately accessible Git objects; not proof of public non-exposure

## Safe method

`scripts/win-secret-provenance-audit.mjs` scans every commit reachable from every ref available in the isolated checkout. It invokes `git grep -I -l` separately for credential classes and records only commit, path and credential type. Matched values never enter the report, and the tool does not compute value-derived hashes or submit repository content to an external service.

The detector covers OpenAI-style keys, GitHub tokens, AWS access-key IDs, private-key headers, literal bearer authorization values and URLs containing credentials. This is a bounded pattern audit, not a substitute for a maintained scanner with independently verified rules and history coverage.

## Coverage map

| Surface | Result | Limitation |
|---|---|---|
| Locally accessible commit history and refs | Scanned | Only refs present in this checkout are knowable locally |
| Tracked docs and workflow definitions | Scanned through history | Does not cover deleted remote-only refs |
| Committed build bundles | Scanned through history | Generated/untracked bundles are not covered |
| Repository visibility | **Public** in live GitHub metadata checked 2026-11-19 | Issue #43's older private observation is stale; reachable GitHub content must be treated as publicly accessible |
| GitHub issue/PR comments | Not scanned by the local tool | Requires a separately bounded API audit |
| Actions logs and artifacts | Not scanned | Retention, permissions and artifact contents remain unverified |
| Deployment bundles/provider logs | Not scanned | Requires provider-specific authorization and evidence |
| External mirrors, archives and local Desktop ZIPs | Not scanned | Not legitimately available in this cloud checkout |
| GitHub scanner application identity | Unverified | No pinned real application identity is configured |
| Scanner scope and rule adequacy | Unverified | Successful generic CI is not secret-scan evidence |

## Interpretation rules

- A zero-finding local pattern scan means only that these detectors found no matching tracked blob in the accessible refs.
- It does not prove that no credential was exposed in comments, logs, artifacts, deployments, deleted remote refs, mirrors or unavailable archives.
- A finding identifies a review target without exposing the matched value. Credible credentials require provider-side revocation/rotation by an authorized owner and separate exposure investigation; this audit does not rotate keys or access billing.
- PR #80 remains blocked for live verification until a dedicated read-only credential and independently reviewed scanner identity are installed through secure host configuration.

## 2026-11-19 accessible-history result

After fetching all accessible remote branches and tags, the audit covered 2,329 commits across 62 local/remote refs. It found no OpenAI-key, GitHub-token, AWS-access-key-ID, private-key-header or literal bearer-authorization pattern.

Seven paths triggered the credentialed-URL detector. Sanitized review confirmed every match is in a workflow example, documentation or test fixture and uses only loopback or IANA-reserved documentation hosts (`localhost`, `127.0.0.1`, TEST-NET, `.example` or equivalent reserved example names). No matched credential text was printed or stored. These are fixture findings, not evidence of a live credential.

The result is therefore: **no credible tracked secret identified in the fetched Git history by this bounded detector set**. Because the repository is public, every reachable tracked blob is publicly accessible. Comments, Actions logs/artifacts, deployment bundles/logs, mirrors and unavailable archives remain coverage gaps; absence of a tracked finding is not proof that those surfaces are clean.
