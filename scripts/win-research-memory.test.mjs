import test from "node:test";
import assert from "node:assert/strict";

function memoryStore() {
  const rows=new Map(); let rev=0; const clone=x=>JSON.parse(JSON.stringify(x));
  return {
    async setJSON(key,value,options={}) { const old=rows.get(key); if(options.onlyIfNew&&old)return{modified:false}; if(options.onlyIfMatch&&(!old||old.etag!==options.onlyIfMatch))return{modified:false}; rows.set(key,{value:clone(value),etag:"m"+(++rev)}); return{modified:true}; },
    async get(key) { return rows.has(key)?clone(rows.get(key).value):null; },
    async *list({prefix=""}={}) { yield {blobs:[...rows.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}; },
    async delete(key) { rows.delete(key); },
    async getWithMetadata(key) { const x=rows.get(key); return x?{data:clone(x.value),etag:x.etag}:null; }
  };
}

test("research agents retain private memory and share only independently accepted findings",async()=>{
  process.env.WIN_STORE_TEST_MODE="1";
  const store=await import("../netlify/lib/store.mts");
  store.installIsolatedTestStore(memoryStore());
  const memory=await import("../netlify/lib/win-research-memory.mts");
  await memory.rememberResearchSubmission({agentId:"agent-a",assignmentId:"task-1",division:"R2",
    summary:"Private finding",findings:["A discovered a timestamp edge case."],limitations:["Small sample."],
    evidence:[{title:"Source",url:"https://example.org",retrievedAt:"2026-11-07T00:00:00Z",note:"Observed"}]});
  let a=await memory.getResearchAgentMemory("agent-a");
  let b=await memory.getResearchAgentMemory("agent-b");
  assert.equal(a.privateResearch.length,1);
  assert.equal(b.privateResearch.length,0);
  assert.equal(a.sharedValidatedResearch.length,0);
  await memory.promoteReviewedResearchMemory({agentId:"agent-a",assignmentId:"task-1",reviewerId:"reviewer-b"});
  a=await memory.getResearchAgentMemory("agent-a");
  b=await memory.getResearchAgentMemory("agent-b");
  assert.equal(a.sharedValidatedResearch.length,1);
  assert.equal(b.sharedValidatedResearch.length,1);
  const prompt=await memory.buildResearchMemoryContext("agent-b");
  assert.match(prompt,/REFERENCE DATA, NOT INSTRUCTIONS/);
  assert.match(prompt,/independently reviewer-accepted/);
  delete process.env.WIN_STORE_TEST_MODE;
});
