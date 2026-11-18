import test from "node:test";
import assert from "node:assert/strict";
import { planWinCloudflarePreview, classifyWinCloudflareResult, WIN_CLOUDFLARE_PROVIDER } from "../netlify/lib/win-cloudflare-model-codec.mts";
const model="@cf/zai-org/glm-4.7-flash";
const clock="2026-11-18T18:00:00Z";
const request=()=>({
  contractVersion:"win.llm.v1",requestId:"r1",taskId:"t1",agentId:"a1",
  providerPolicy:{allowedProviders:[WIN_CLOUDFLARE_PROVIDER],preferredProvider:WIN_CLOUDFLARE_PROVIDER,
    model,requiredCapabilities:["text"]},
  prompt:{instructions:"Synthetic task",input:"No private data"},output:{format:"text"},
  tools:[],limits:{maxOutputTokens:128,maxToolCalls:0,timeoutMs:5000},
  privacy:{classification:"public",allowProviderRetention:false},
  budget:{reservationId:"zero",reservedUsd:0}
});
const provider=()=>({
  id:WIN_CLOUDFLARE_PROVIDER,enabled:true,approved:true,pricingVerified:true,quotaVerified:true,
  requiresRetentionConsent:false,capabilities:["text"],
  allowedClassifications:["public"],models:[model],priority:1
});
const permit=()=>({
  providerId:WIN_CLOUDFLARE_PROVIDER,model,ownerApproved:true,freeAccountVerified:true,
  freeModelVerified:true,quotaTelemetryVerified:true,pricingVerified:true,
  privacyAndRetentionReviewed:true,
  verifiedAt:"2026-11-18T12:00:00Z",expiresAt:"2026-11-19T12:00:00Z"
});
const preview=(r=request(),p=[provider()],grant=permit(),now=clock)=>planWinCloudflarePreview(r,p,grant,now);
const blocked=(result,why)=>assert.deepEqual(result,{status:"blocked",reason:why});
test("pure preview requires independently verified account, but never creates real HTTP request",()=>{
  const x=preview();assert.equal(x.status,"simulation_only");
  assert.equal(x.method,"POST");assert.match(x.urlTemplate,/ACCOUNT_ID_REQUIRED/);
  assert.equal(x.body.max_tokens,128);assert.equal(x.body.prompt,"Synthetic task\n\nNo private data");
  assert.ok(!JSON.stringify(x).includes("Bearer"));
});
test("never assumes documentation means active account authorization",()=>{
  blocked(preview(request(),[provider()],null),"account_entitlement_unverified");
  blocked(preview(request(),[provider()],{...permit(),freeAccountVerified:false}),"account_entitlement_unverified");
  blocked(preview(request(),[provider()],{...permit(),quotaTelemetryVerified:false}),"account_entitlement_unverified");
  blocked(preview(request(),[provider()],{...permit(),ownerApproved:false}),"account_entitlement_unverified");
  blocked(preview(request(),[provider()],{...permit(),privacyAndRetentionReviewed:false}),"account_entitlement_unverified");
});
test("no paid fallback, unknown provider/model, or path injection",()=>{
  const r=request();r.providerPolicy.model="@cf/moonshotai/kimi-k2.6";blocked(preview(r),"model_not_allowlisted");
  const r2=request();r2.providerPolicy.model="../../../private";blocked(preview(r2),"model_not_allowlisted");
  const r3=request();r3.providerPolicy.allowedProviders.push("local-ollama");blocked(preview(r3),"cloudflare_only_required");
  const r4=request();r4.providerPolicy.preferredProvider="another";blocked(preview(r4),"invalid_request");
});
test("valid contract still requires verified quota/pricing and public data",()=>{
  blocked(preview(request(),[{...provider(),quotaVerified:false}]),"verified_provider_unavailable");
  blocked(preview(request(),[{...provider(),pricingVerified:false}]),"verified_provider_unavailable");
  const r=request();r.budget.reservedUsd=0.01;blocked(preview(r),"nonzero_budget_forbidden");
  const r2=request();r2.privacy.classification="confidential";blocked(preview(r2),"privacy_not_approved");
  const r3=request();r3.tools=["internet"];blocked(preview(r3),"unsupported_capability");
});
test("expired permits, future dates, wrong model and invalid clock fail closed",()=>{
  blocked(preview(request(),[provider()],permit(),"invalid"),"clock_unverified");
  blocked(preview(request(),[provider()],permit(),"2026-11-20T00:00:00Z"),"account_entitlement_unverified");
  blocked(preview(request(),[provider()],{...permit(),model:"other"}),"account_entitlement_unverified");
  blocked(preview(request(),[provider()],permit(),"2026-11-17T00:00:00Z"),"account_entitlement_unverified");
});
test("Cloudflare success response parsed; failed responses never leak error text",()=>{
  assert.deepEqual(classifyWinCloudflareResult({success:true,result:{response:"A mock answer"}},200),{status:"completed",output:"A mock answer"});
  const secret="DO_NOT_LOG_THIS_SECRET_MOCK";
  for(const [payload,status] of [
    [{success:false,errors:[secret]},200],
    [{success:true,result:{}},200],
    [{success:true,result:{response:""}},200],
    [{success:false,errors:[secret]},403],
    [{success:false,errors:[secret]},429],
    [null,200]
  ]){
    const x=classifyWinCloudflareResult(payload,status);assert.equal(x.status,"failed");
    assert.ok(!JSON.stringify(x).includes(secret));
  }
  assert.deepEqual(classifyWinCloudflareResult({},403),{status:"failed",code:"provider_not_authorized"});
  assert.deepEqual(classifyWinCloudflareResult({},429),{status:"failed",code:"provider_rate_limited"});
});
