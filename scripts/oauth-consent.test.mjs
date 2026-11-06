import test from "node:test";
import assert from "node:assert/strict";
import { describeOAuthScopes } from "../netlify/functions/oauth-authorize.mts";

test("OAuth consent does not overstate research access for read-only scopes", () => {
  const readOnly = describeOAuthScopes("win:read offline_access");
  assert.match(readOnly, /Read WIN research records/);
  assert.match(readOnly, /refresh tokens/);
  assert.doesNotMatch(readOnly, /Start research runs/);
  assert.doesNotMatch(readOnly, /place bets/);
});

test("OAuth consent describes audit, read and research scopes independently", () => {
  const audit = describeOAuthScopes("win:audit");
  assert.match(audit, /Read-only diagnostics/);
  assert.doesNotMatch(audit, /Start research runs/);

  const research = describeOAuthScopes("win:research");
  assert.match(research, /Start research runs/);
  assert.doesNotMatch(research, /Read WIN research records/);
  assert.match(research, /does not place bets/);
});
