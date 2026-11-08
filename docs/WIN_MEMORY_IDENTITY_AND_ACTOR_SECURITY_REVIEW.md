# WIN Memory Identity and Research Actor Authentication — Review Gate

**Scope:** Draft-only memory identity fix and actor-security integration plan. Neither cloud databases nor production runtime were modified.

## 1. Confirmed memory collision

Current key generation replaced every punctuation character with `_`, then truncated each component. Therefore `agent-A + task/a` and `agent-A + task?a` both mapped to `agent-A__task_a`. The second `putIfNew` could be mistaken for an idempotent repeat, silently returning the first assignment's memory. This threatens long-term memory persistence and the correctness of reviewer acceptance.

### Proposed code correction

`netlify/lib/win-research-memory.mts` now generates keys using `v2_<sha256(JSON.stringify([normalizedAgentId, normalizedAssignmentId]))>`, retaining the complete identity pair instead of lossy punctuation replacement. This makes collisions due to punctuation substitution, delimiter ambiguity and truncation extremely unlikely. SHA-256 is **not** authentication. Same exact assignment still retains idempotent behavior; a stored entry's identities are checked before reuse.

For legacy entries, reads and promotions fallback to the old key **only when the fetched entry's full agent/assignment pair matches exactly**. This prevents promoting somebody else's colliding entry, while retaining access to noncolliding historic records.

**Review caveats:** Identity inputs are still normalized using the existing length limits; overlength identifiers can still truncate and alias before hashing. Upstream assignment IDs are UUID-like and bounded; full prevention requires strict rejection instead of truncation at all boundaries. The legacy private memory entries remain under old keys; the fix does not migrate or delete them. A separate consistency check and additive migration plan are needed before changing production.

Run focused tests in isolated checkout:
```powershell
node --experimental-strip-types --test scripts/win-research-memory.test.mjs scripts/win-research-memory-identity.test.mjs
```
Then run full WIN suite, quality gates and build checks. Review module import/test-store isolation, exact-head results and production compatibility before any merge.

## 2. Confirmed actor-authentication boundary — NOT fixed by the memory change

`/api/research-assignments` checks shared `WIN_INTERNAL_TOKEN` through `requireAuth` and reads `actorId` from the **request body**. The token proves access to the shared endpoint, **not** that the caller is the specific owner/reviewer named in `actorId`. Therefore trusted callers with the shared token can impersonate a different owner/reviewer.

Current route must stay restricted to trusted server-side callers; never expose the token or route to untrusted agents or client applications. Adding another request-body field or header without a separately verified identity does not solve this.

### Proposed secure migration plan (no production activation)

1. Inventory callers of `/api/research-assignments`, including OpenCode/local runner and Netlify internal flows, and identify the current trust principals. Preserve the known trusted-only mode until migrated.
2. Design a distinct **verifiable principal per actor**: e.g., signature-verified identity assertions from an approved gateway or per-agent cryptographically distinct credentials. Bind the verified principal to server-controlled `actorId`, never caller-supplied `actorId`; separate owner/reviewer/agent scopes.
3. Deny requests with missing/invalid principal, actor mismatch, replayed credentials, wrong audience/expiry or insufficient assigned role; tests must verify that submitter cannot approve or review self.
4. Reconcile existing assignments and service identities; add deployment checklist, rollback, redacted audit logging, credential rotation and quota enforcement.
5. Implement and verify the authenticated principal middleware **in another draft**, then enable it only after independent approval and trusted-caller migration. No production identity enforcement change has been made in this PR.

## Review / release criteria

- Prevent both silent memory overwrite and inadvertent legacy promotion across colliding identities.
- Runtime proof of persistence and read-after-write must precede any use as authoritative agent memory.
- Keep untrusted agent-generated research separated from independently accepted research; no direct production knowledge promotion.
- Confirm scoped principal identity on every owner/reviewer action before untrusted multi-agent access.
- Backup/export design and storage-capacity controls before long-term claims.
- No live Neon migration, production deploy/merge, new billable service or changes to payment access without separate owner authorization.

Related coordination: [Issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20), memory evidence in comments 6717245162 and 6717318490.
