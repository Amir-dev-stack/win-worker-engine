import test from "node:test";
import assert from "node:assert/strict";
import { planWinCloudModel } from "../netlify/lib/win-cloud-model-plan.mts";

const request = () => ({
  contractVersion:"win.llm.v1",requestId:"req-001",taskId:"task-001",agentId:"agent-001",
  providerPolicy:{allowedProviders:["verified-cloud"],preferredProvider:"verified-cloud",
    model:"approved-model",requiredCapabilities:["text"]},
  prompt:{instructions:"Analyze synthetic fixture",input:"Offline sample only"},
  output:{format:"text"},tools:[],
  limits:{maxOutputTokens:500,maxToolCalls:0,timeoutMs:1000},
  privacy:{classification:"public",allowProviderRetention:false},
  budget:{reservationId:"zero-budget",reservedUsd:0}
});
const provider = () => ({
  id:"verified-cloud",enabled:true,approved:true,pricingVerified:true,quotaVerified:true,
  capabilities:["text"],allowedClassifications:["public"],models:["approved-model"],priority:1
});
const entitlement = () => ({
  providerId:"verified-cloud",model:"approved-model",confirmedNoCharge:true,
  verifiedAt:"2026-11-18T12:00:00Z",expiresAt:"2026-11-19T12:00:00Z",
  source:"approved entitlement evidence",supportsOffPc:true
});
const at = "2026-11-18T18:00:00Z";
const plan=(r=request(),p=[provider()],e=[entitlement()],clock=at)=>planWinCloudModel(r,p,e,clock);
const blocked=(result,reason)=>{assert.equal(result.status,"blocked");assert.equal(result.reason,reason);};
test("does not call providers or execute anything; requires explicit verified entitlement",()=>{
  const result=plan();
  assert.deepEqual(result,{status:"ready_for_separately_authorized_test",providerId:"verified-cloud",model:"approved-model",requestId:"req-001"});
});
test("no entitlement or unverifiable eligibility fails closed",()=>{
  blocked(plan(request(),[provider()],[]),"unique_entitlement_required");
  blocked(plan(request(),[provider()],null),"entitlement_evidence_missing");
  blocked(plan(request(),[{...provider(),quotaVerified:false}]),"approved_eligible_provider_unavailable");
  blocked(plan(request(),[{...provider(),approved:false}]),"approved_eligible_provider_unavailable");
  blocked(plan(request(),[{...provider(),pricingVerified:false}]),"approved_eligible_provider_unavailable");
});
test("never route tasks to unapproved local/unknown provider or implicit fallback",()=>{
  const r=request();r.providerPolicy.allowedProviders=["verified-cloud","local-ollama"];
  blocked(plan(r),"single_provider_required");
  const r2=request();delete r2.providerPolicy.model;
  blocked(plan(r2),"explicit_model_required");
  const r3=request();r3.providerPolicy.allowedProviders=["local-ollama"];
  blocked(plan(r3),"invalid_llm_request");
});
test("zero-spend requirement is independent of model/provider pricing flags",()=>{
  const r=request();r.budget.reservedUsd=0.01;
  blocked(plan(r),"nonzero_budget_forbidden");
  blocked(plan(request(),[provider()],[{...entitlement(),confirmedNoCharge:false}]),"entitlement_unverified");
});
test("retention, classification and tool capabilities still enforced by LLM contract",()=>{
  blocked(plan({...request(),privacy:{classification:"confidential",allowProviderRetention:false}}),"approved_eligible_provider_unavailable");
  blocked(plan(request(),[{...provider(),requiresRetentionConsent:true}]),"approved_eligible_provider_unavailable");
  const r=request();r.providerPolicy.requiredCapabilities=["function_tools"];
  blocked(plan(r),"approved_eligible_provider_unavailable");
});
test("reject future or expired entitlement and malformed audit clock",()=>{
  blocked(plan(request(),[provider()],[entitlement()],"not-a-time"),"audit_clock_invalid");
  blocked(plan(request(),[provider()],[entitlement()],"2026-11-17T23:00:00Z"),"entitlement_expired_or_future");
  blocked(plan(request(),[provider()],[entitlement()],"2026-11-19T12:00:00Z"),"entitlement_expired_or_future");
  blocked(plan(request(),[provider()],[{...entitlement(),verifiedAt:"yesterday"}]),"entitlement_unverified");
  blocked(plan(request(),[provider()],[{...entitlement(),source:""}]),"entitlement_unverified");
});
test("conflicting duplicate claims are blocked rather than selecting an optimistic one",()=>{
  blocked(plan(request(),[provider()],[entitlement(),entitlement()]),"unique_entitlement_required");
});
test("malformed request never reaches provider selection",()=>{
  const r=request();r.prompt.input="";
  blocked(plan(r),"invalid_llm_request");
});
