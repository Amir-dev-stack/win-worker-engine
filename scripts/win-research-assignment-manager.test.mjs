import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function memoryStore() {
  const rows = new Map(); let rev = 0;
  const clone = x => JSON.parse(JSON.stringify(x));
  return {
    async setJSON(key,value,options={}) {
      const old=rows.get(key);
      if(options.onlyIfNew && old) return {modified:false};
      if(options.onlyIfMatch && (!old || old.etag!==options.onlyIfMatch)) return {modified:false};
      rows.set(key,{value:clone(value),etag:"e"+(++rev)}); return {modified:true};
    },
    async get(key) { return rows.has(key)?clone(rows.get(key).value):null; },
    async *list({prefix=""}={}) { yield {blobs:[...rows.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}; },
    async delete(key) { rows.delete(key); },
    async getWithMetadata(key) { const x=rows.get(key); return x?{data:clone(x.value),etag:x.etag}:null; }
  };
}

test("research assignment manager enforces approval, lease, untrusted intake and independent review", async () => {
  process.env.WIN_STORE_TEST_MODE="1";
  const store=await import("../netlify/lib/store.mts");
  store.installIsolatedTestStore(memoryStore());
  const manager=await import("../netlify/lib/win-research-assignment-manager.mts");
  const base={title:"Football odds pipeline audit",division:"R2",objective:"Verify timestamp integrity before kickoff.",
    acceptanceCriteria:["Reject post-kickoff quotes","Provide reproducible tests"],sourceScope:["https://example.org/data"],
    dataRestrictions:["Public or synthetic only"],expectedArtifacts:["audit.json"],independentReviewerId:"reviewer-1"};
  const assignment=await manager.createResearchAssignment(base,"owner-1",1000);
  assert.equal(assignment.status,"proposed");
  assert.equal(assignment.budgetCeilingUsd,0.15);
  assert.equal(assignment.modelCallLimit,3);
  assert.equal(assignment.toolCallLimit,4);
  await assert.rejects(()=>manager.claimResearchAssignment(assignment.id,"agent-1",2000),/not available/);
  await assert.rejects(()=>manager.approveResearchAssignment(assignment.id,"intruder",2000),/Only the assignment owner/);
  await manager.approveResearchAssignment(assignment.id,"owner-1",2000);
  assert.equal((await manager.getApprovedResearchAssignments()).length,1);
  const releaseTask=await manager.createResearchAssignment({...base,title:"Release lease test"},"owner-1",2100);
  await manager.approveResearchAssignment(releaseTask.id,"owner-1",2200);
  const releaseClaim=await manager.claimResearchAssignment(releaseTask.id,"agent-release",2300);
  const released=await manager.releaseResearchAssignment(releaseTask.id,"agent-release",releaseClaim.leaseId,"test release",2400);
  assert.equal(released.status,"approved");
  const [claimA,claimB]=await Promise.allSettled([
    manager.claimResearchAssignment(assignment.id,"agent-1",3000),
    manager.claimResearchAssignment(assignment.id,"agent-2",3000)
  ]);
  assert.equal([claimA,claimB].filter(x=>x.status==="fulfilled").length,1,"only one worker can claim the assignment");
  const claim=claimA.status==="fulfilled"?claimA.value:claimB.status==="fulfilled"?claimB.value:null;
  const agent=claim.assignedAgentId;
  const artifactContent={fixture:"assignment-bound cloud artifact",rows:3};
  const artifactDigest=createHash("sha256").update(JSON.stringify(artifactContent,null,2),"utf8").digest("hex");
  await assert.rejects(()=>manager.storeResearchArtifact(assignment.id,agent,claim.leaseId,artifactContent,"0".repeat(64),3500),/SHA-256/);
  const uploaded=await manager.storeResearchArtifact(assignment.id,agent,claim.leaseId,artifactContent,artifactDigest,3500);
  const submission={summary:"Timestamp audit completed.",findings:["Post-kickoff quotes are rejected."],
    limitations:["Sample contains synthetic rows."],evidence:[{title:"Public specification",url:"https://example.org/spec",retrievedAt:"2026-11-07T00:00:00Z"}],
    artifacts:[{name:"audit.json",mediaType:"application/json",sha256:uploaded.sha256,location:uploaded.location,reproductionCommand:"node audit.mjs"}]};
  await assert.rejects(()=>manager.submitResearchAssignment(assignment.id,agent,"wrong-lease",submission,4000),/valid, unexpired/);
  const forgedLocal={...submission,artifacts:[{...submission.artifacts[0],location:"local-file:C:/temp/audit.json"}]};
  await assert.rejects(()=>manager.submitResearchAssignment(assignment.id,agent,claim.leaseId,forgedLocal,4000),/Artifact location/);
  const forged={...submission,artifacts:[{...submission.artifacts[0],location:"win-blob://library/research-artifacts/research-artifact-not-found"}]};
  await assert.rejects(()=>manager.submitResearchAssignment(assignment.id,agent,claim.leaseId,forged,4000),/Cloud artifact/);
  const forgedDigest={...submission,artifacts:[{...submission.artifacts[0],sha256:"f".repeat(64)}]};
  await assert.rejects(()=>manager.submitResearchAssignment(assignment.id,agent,claim.leaseId,forgedDigest,4000),/Cloud artifact/);
  const saved=await manager.submitResearchAssignment(assignment.id,agent,claim.leaseId,submission,4000);
  assert.equal(saved.status,"untrusted_pending_review");
  const researchMemory=await import("../netlify/lib/win-research-memory.mts");
  const privateMemory=await researchMemory.getResearchAgentMemory(agent);
  assert.equal(privateMemory.privateResearch.length,1);
  assert.equal(privateMemory.sharedValidatedResearch.length,0);
  await assert.rejects(()=>manager.reviewResearchSubmission(assignment.id,agent,"accept","looks good",5000),/assigned independent reviewer/);
  await assert.rejects(()=>manager.reviewResearchSubmission(assignment.id,"reviewer-1","accept","",5000),/rationale/);
  await manager.challengeResearchSubmission(assignment.id,"reviewer-1",{objections:["Need independent reproduction"],reproduction:"Reproduced using the supplied command."},5000);
  const reviewed=await manager.reviewResearchSubmission(assignment.id,"reviewer-1","accept","Reproduced; limitations are documented.",6000);
  assert.equal(reviewed.status,"accepted");
  assert.equal(reviewed.trustedKnowledgePromotion,"separate_owner_action_required");
  const sharedMemory=await researchMemory.getResearchAgentMemory("independent-agent");
  assert.equal(sharedMemory.sharedValidatedResearch.length,1);
  assert.equal(sharedMemory.sharedValidatedResearch[0].reviewerId,"reviewer-1");
  const status=await manager.getResearchAssignmentStatus();
  assert.equal(status.accepted,1);
  assert.equal(status.modelCallsAuthorizedByDefault,0);
  assert.equal(status.productionWrites,false);
  delete process.env.WIN_STORE_TEST_MODE;
});
