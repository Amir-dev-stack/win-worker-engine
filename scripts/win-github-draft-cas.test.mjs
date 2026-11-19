import test from "node:test";
import assert from "node:assert/strict";
import { guardedDraftUpdate } from "./win-github-draft-cas.mjs";

const A="a".repeat(40), B="b".repeat(40), C="c".repeat(40);
function req(overrides={}) {
 return { repository:"Amir-dev-stack/win-worker-engine",
   branch:"win-draft/backup-review-1",
   expectedHead:A,proposedCommit:B,taskId:"win-1",
   actorId:"cloud-reviewer-1",fence:3,
   approved:true,productionWriteAllowed:false,paidSpendAllowed:false,
   draftOnly:true,paths:["scripts/review-proposal.mjs"],...overrides};
}
function services(options={}) {
 let writes=0,reads=0,heads=0,inspections=0;
 const lease={task_id:"win-1",owner_id:"cloud-reviewer-1",fence:"3",
   status:"running",approved:true,source_commit_sha:C,
   expires_at:new Date(Date.now()+3600000).toISOString(),...options.lease};
 const io={
  leaseReader:{getCurrent:async()=>{
    reads++;
    if(options.leaseError) throw Error("no log");
    return options.revokeOnRecheck && reads>1 ? {...lease,approved:false} : lease;
  }},
  git:{
    atomicCompareAndSwapVerified:options.casVerified??true,
    getHead:async()=>{heads++;if(options.headError)throw Error("no log");return options.head??A;},
    inspectProposedCommit:async()=>{
      inspections++;
      if(options.inspectError) throw Error("untrusted commit");
      return options.commit??{sha:B,parents:[A],
        files:["scripts/review-proposal.mjs"],secretScanPassed:true,sourceVerified:true};
    },
    updateHeadIfEquals:async write=>{
      writes++;
      if(options.writeError)throw Error("uncertain after write");
      return options.writeResult??{updated:true,oldHead:write.expectedHead,newHead:write.newHead};
    }
  }
 };
 return {io,counts:()=>({writes,reads,heads,inspections})};
}
test("valid fenced approval and unchanged draft head invokes one atomic GitHub CAS",async()=>{
 const fixture=services();
 const result=await guardedDraftUpdate(req(),fixture.io);
 assert.equal(result.status,"draft_written");
 assert.equal(result.head,B);
 assert.equal(result.requiresIndependentReview,true);
 assert.equal(result.writeOperations,1);
 assert.deepEqual(fixture.counts(),{writes:1,reads:2,heads:1,inspections:1});
});
test("invalid requests never invoke lease or GitHub",async()=>{
 const invalid=[
  {branch:"main"},{branch:"production"},{branch:"win-draft/../main"},
  {branch:"win-draft/release/hotfix"},{branch:"win-draft/.github"},
  {expectedHead:"latest"},{proposedCommit:A},{fence:0},
  {draftOnly:false},{approved:false},{paidSpendAllowed:true},
  {productionWriteAllowed:true},{paths:[".env"]},
  {paths:["secrets/token.txt"]},{paths:["scripts/private.key"]},
  {paths:["scripts/a.mjs","scripts/a.mjs"]},{paths:[]},
  {repository:"someone/other"},{actorId:"bad actor"}
 ];
 for(const change of invalid) {
  const f=services();
  await assert.rejects(guardedDraftUpdate(req(change),f.io),
    /UNSAFE_DRAFT_WRITE_REQUEST/,JSON.stringify(change));
  assert.deepEqual(f.counts(),{writes:0,reads:0,heads:0,inspections:0});
 }
});
test("missing or unverified atomic CAS adapter cannot write",async()=>{
 const f=services({casVerified:false});
 const result=await guardedDraftUpdate(req(),f.io);
 assert.equal(result.reason,"TRUSTED_IO_NOT_CONFIGURED");
 assert.equal(f.counts().writes,0);
 assert.equal((await guardedDraftUpdate(req())).writeOperations,0);
});
test("revoked, wrong owner or stale lease must stop without remote writes",async()=>{
 for(const opts of [
  {lease:{approved:false}},{lease:{fence:"2"}},
  {lease:{owner_id:"other"}},{lease:{task_id:"other"}},
  {lease:{status:"blocked_uncertain"}},
  {lease:{expires_at:"2020-01-01T00:00:00Z"}},
  {leaseError:true}
 ]) {
  const f=services(opts);
  const result=await guardedDraftUpdate(req(),f.io);
  assert.equal(result.status,"hold");
  assert.equal(f.counts().writes,0);
 }
});
test("changed, unverifiable or revoked-after-first-check head blocks dispatch",async()=>{
 for(const opts of [{head:C},{headError:true},{revokeOnRecheck:true}]) {
  const f=services(opts);
  const result=await guardedDraftUpdate(req(),f.io);
  assert.equal(result.status,"hold");
  assert.equal(f.counts().writes,0);
 }
});
test("uncertain post-write error, mismatched CAS result, or conflict never triggers retry",async()=>{
 for(const opts of [
  {writeError:true},
  {writeResult:{updated:false,oldHead:A,newHead:B}},
  {writeResult:{updated:true,oldHead:C,newHead:B}},
  {writeResult:{updated:true,oldHead:A,newHead:C}}
 ]) {
  const f=services(opts);
  const result=await guardedDraftUpdate(req(),f.io);
  assert.equal(result.reason,"GITHUB_CAS_UNCERTAIN_OR_REJECTED");
  assert.equal(f.counts().writes,1,"must not retry uncertain remote writes");
 }
});

test("proposed commit must have exactly the expected sole parent and verified exact paths",async()=>{
 const bad=[
  {sha:C,parents:[A],files:["scripts/review-proposal.mjs"],secretScanPassed:true,sourceVerified:true},
  {sha:B,parents:[C],files:["scripts/review-proposal.mjs"],secretScanPassed:true,sourceVerified:true},
  {sha:B,parents:[A,C],files:["scripts/review-proposal.mjs"],secretScanPassed:true,sourceVerified:true},
  {sha:B,parents:[],files:["scripts/review-proposal.mjs"],secretScanPassed:true,sourceVerified:true},
  {sha:B,parents:[A],files:["scripts/extra.mjs"],secretScanPassed:true,sourceVerified:true},
  {sha:B,parents:[A],files:["scripts/review-proposal.mjs","scripts/hidden.mjs"],secretScanPassed:true,sourceVerified:true},
  {sha:B,parents:[A],files:["scripts/review-proposal.mjs",".env"],secretScanPassed:true,sourceVerified:true},
  {sha:B,parents:[A],files:["scripts/review-proposal.mjs"],secretScanPassed:false,sourceVerified:true},
  {sha:B,parents:[A],files:["scripts/review-proposal.mjs"],secretScanPassed:true,sourceVerified:false}
 ];
 for(const commit of bad){
  const f=services({commit});
  const result=await guardedDraftUpdate(req(),f.io);
  assert.equal(result.reason,"PROPOSED_COMMIT_UNVERIFIED",JSON.stringify(commit));
  assert.equal(f.counts().writes,0);
 }
 const f=services({inspectError:true});
 assert.equal((await guardedDraftUpdate(req(),f.io)).reason,"PROPOSED_COMMIT_UNVERIFIED");
 assert.equal(f.counts().writes,0);
});
test("inspector must be independently supplied before any lease or GitHub operation",async()=>{
 const f=services();
 delete f.io.git.inspectProposedCommit;
 assert.equal((await guardedDraftUpdate(req(),f.io)).reason,"TRUSTED_IO_NOT_CONFIGURED");
 assert.deepEqual(f.counts(),{writes:0,reads:0,heads:0,inspections:0});
});
