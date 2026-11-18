import test from "node:test";
import assert from "node:assert/strict";
import { cloudReadiness } from "./win-cloud-readiness.mjs";

test("scheduled check stays offline, blocks inference and spends nothing",()=>{
  const result=cloudReadiness("2026-11-18T18:00:00Z");
  assert.deepEqual(result,{
    mode:"offline_policy_check",
    status:"blocked_until_provider_entitlement_verified",
    remoteInferenceCalls:0,
    codexDispatches:0,
    budgetUsd:0,
    providerCredentialsUsed:false,
    checkedAt:"2026-11-18T18:00:00Z"
  });
});
test("invalid clock fails closed",()=>{
  assert.throws(()=>cloudReadiness("wrong"),/CLOUD_READINESS_FAIL_CLOSED_INVARIANT/);
});
