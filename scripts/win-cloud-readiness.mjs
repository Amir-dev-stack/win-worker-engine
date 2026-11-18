/** Scheduled cloud-readiness check. Never sends inference/dispatch requests. */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { planWinCloudModel } from "../netlify/lib/win-cloud-model-plan.mts";

export function cloudReadiness(now = new Date().toISOString()) {
  // An empty provider list and no entitlements are intentional: no provider
  // has been verified or authorized for paid-free cloud execution.
  const request = {
    contractVersion:"win.llm.v1",
    requestId:"win-cloud-readiness",
    taskId:"readiness-only",
    agentId:"win-ci",
    providerPolicy:{allowedProviders:["unconfigured-cloud-provider"],
      model:"unconfigured-cloud-model",requiredCapabilities:["text"]},
    prompt:{instructions:"Readiness check only",input:"Synthetic and offline"},
    output:{format:"text"},tools:[],
    limits:{maxOutputTokens:1,maxToolCalls:0,timeoutMs:1000},
    privacy:{classification:"public",allowProviderRetention:false},
    budget:{reservationId:"zero-charge",reservedUsd:0}
  };
  const plan=planWinCloudModel(request,[],[],now);
  if(plan.status!=="blocked" || plan.reason!=="approved_eligible_provider_unavailable"){
    throw new Error("CLOUD_READINESS_FAIL_CLOSED_INVARIANT");
  }
  return {
    mode:"offline_policy_check",
    status:"blocked_until_provider_entitlement_verified",
    remoteInferenceCalls:0,
    codexDispatches:0,
    budgetUsd:0,
    providerCredentialsUsed:false,
    checkedAt:now
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  console.log(JSON.stringify(cloudReadiness()));
}
