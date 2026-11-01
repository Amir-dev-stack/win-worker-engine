const $=s=>document.querySelector(s);
let token=sessionStorage.getItem("win-token")||"";
let selectedRunId=null;
const dialog=$("#tokenDialog");
function headers(){return {"content-type":"application/json","authorization":"Bearer "+token}}
async function api(path,options={}){const r=await fetch(path,{...options,headers:{...headers(),...(options.headers||{})}});if(r.status===401){if(!dialog.open)dialog.showModal();throw new Error("Connect using your WIN internal token.");}const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Request failed ("+r.status+")");return data}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function decisionClass(text=""){const t=String(text).toUpperCase();return t.includes("NO BET")?"no":t.includes("BET")?"bet":"wait"}
function safeUrl(value){try{const u=new URL(value);return ["https:","http:"].includes(u.protocol)?u.href:""}catch{return ""}}
function citationHtml(items=[]){return items.map(c=>{const u=safeUrl(c.url);return u?'<a href="'+escapeHtml(u)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(c.title||u)+'</a>':""}).filter(Boolean).join("")}
function reportCard(item){
 const title=escapeHtml((item.departmentId?item.departmentId+" · ":"")+(item.role||"Research report"));
 const state=escapeHtml(item.status||"unknown");
 const error=item.error?'<p class="report-error">'+escapeHtml(item.error)+'</p>':"";
 const report=item.report?'<pre>'+escapeHtml(item.report)+'</pre>':"";
 const citations=citationHtml(item.citations||[]);
 return '<article class="report-card"><div class="report-title"><b>'+title+'</b><span class="decision '+(state==="completed"?"bet":state==="failed"?"no":"wait")+'">'+state+'</span></div>'+error+report+(citations?'<div class="citations"><b>Sources:</b> '+citations+'</div>':"")+'</article>';
}
function networkPanel(network){
 if(!network)return '<div class="empty">Worker-network manifest not available for this run.</div>';
 const counts=network.nodeCounts||{};
 const summary=network.executionSummary||{};
 const nodes=network.nodes||[];
 const departments=nodes.filter(n=>n.tier==="MAIN_DEPARTMENT");
 const tiers=["T1","T2","T3","T4","T5"];
 const labels={T1:"Sport / discipline chiefs",T2:"Sport × country chiefs",T3:"Competition chiefs",T4:"Match / event chiefs",T5:"Event specialist assignments"};
 const tierHtml=tiers.map(t=>{
   const selected=nodes.filter(n=>n.tier===t);
   return '<h5>'+labels[t]+' ('+selected.length+')</h5>'+(selected.length?selected.slice(0,60).map(n=>'<div class="network-row"><span>'+escapeHtml(n.name)+'</span><small>'+escapeHtml(n.status)+'</small></div>').join(""):'<div class="empty">No verified or supplied nodes in this tier.</div>');
 }).join("");
 const deptHtml=departments.map(n=>'<div class="network-row"><span>'+escapeHtml(n.name)+'</span><small>'+escapeHtml(n.status)+'</small></div>').join("");
 const apiText=summary.actualApiSessions!==undefined
   ?summary.actualApiSessions+" actual model API sessions ("+summary.completedDepartmentReports+" department reports, "+summary.completedDebateReports+" completed challenge reports)"
   :"Department and challenge execution details are still pending.";
 return '<section class="network-panel"><div class="report-title"><b>WIN worker network</b><span class="decision">'+escapeHtml(network.runId||"Run")+'</span></div><p>'+escapeHtml(network.executionDisclosure||"")+'</p><div class="network-stats"><span>'+Number(counts.sports||0)+' sports</span><span>'+Number(counts.sportCountryBranches||0)+' sport/country nodes</span><span>'+Number(counts.competitions||0)+' competitions</span><span>'+Number(counts.events||0)+' events</span><span>'+Number(counts.eventSpecialistAssignments||0)+' specialist assignments</span></div><h5>Eight main departments</h5>'+deptHtml+'<h5>Independent worker hierarchy</h5>'+tierHtml+'<p class="detail-meta">'+escapeHtml(apiText)+'</p><p class="detail-meta">The tier chiefs and per-event specialist roles are task assignments covered by the department API passes; they are not counted as additional independent model sessions.</p></section>';
}
function renderRunDetail(run){
 const node=$("#runDetail");
 const workers=run.workers||[];
 const debate=run.debate||[];
 const title=escapeHtml(run.brief?.event||run.id);
 const taskType=escapeHtml(run.brief?.taskType||"research_event");
 const brief='<div class="detail-meta">'+escapeHtml(run.status||"unknown")+' · '+taskType+' · Started '+escapeHtml(new Date(run.createdAt).toLocaleString())+'</div>';
 const cards=workers.length?workers.map(reportCard).join(""):'<div class="empty">Department reports have not arrived yet.</div>';
 const challengeCards=debate.length?debate.map(reportCard).join(""):'<div class="empty">Adversarial review reports have not arrived yet.</div>';
 const master=run.master?reportCard(run.master):'<div class="empty">Global Master report not available yet.</div>';
 const existing=run.brief?.existingCoupon?'<h4>Coupon under review</h4><pre>'+escapeHtml(run.brief.existingCoupon)+'</pre>':"";
 const error=run.error?'<p class="report-error">'+escapeHtml(run.error)+'</p>':"";
 node.innerHTML='<div class="detail-head"><div><div class="eyebrow">SELECTED INVESTIGATION</div><h3>'+title+'</h3>'+brief+'</div><button class="subtle" id="closeRunDetail">Close</button></div>'+networkPanel(run.workerNetwork)+existing+'<h4>Eight department reports ('+workers.length+')</h4>'+cards+'<h4>Independent adversarial review ('+debate.length+')</h4>'+challengeCards+'<h4>Global Master — final decision</h4>'+master+error;
 node.classList.remove("hidden");
 $("#closeRunDetail").addEventListener("click",()=>{node.classList.add("hidden");selectedRunId=null});
}
async function openRun(id){
 selectedRunId=id;
 const node=$("#runDetail");
 node.classList.remove("hidden");
 node.textContent="Loading the complete WIN worker network and research reports…";
 try{renderRunDetail(await api("/api/runs/"+encodeURIComponent(id)))}
 catch(e){node.textContent=e.message}
}
async function refreshLibrary(){
 const category=$("#libraryCategory")?.value||"all";
 const query=$("#libraryQuery")?.value.trim()||"";
 const params=new URLSearchParams({category,limit:"40"});
 if(query)params.set("q",query);
 try{
  const data=await api("/api/library?"+params.toString());
  const items=data.items||[];
  $("#libraryStatus").textContent=items.length+" records shown · "+category+" · reviewed "+new Date(data.reviewedAt).toLocaleTimeString();
  $("#libraryList").innerHTML=items.length?items.map(item=>{
   const type=escapeHtml(item.recordType||item.entityType||"library record");
   const title=escapeHtml(item.label||item.title||item.name||item.event||item.agentId||item.id||"WIN record");
   const state=escapeHtml(item.outcome||item.validationStatus||item.status||"saved");
   const date=item.updatedAt||item.createdAt||item.savedAt||item.observedAt||item.recordedAt;
   const body=escapeHtml(item.couponText||item.note||item.observation||item.finalAnalysis||item.report||item.agentMission||item.decision||"");
   const id=escapeHtml(item.id||"");
   const couponActions=item.recordType==="coupon"&&item.outcome==="pending"
     ?'<div class="library-actions"><button type="button" class="subtle" data-settle-id="'+id+'" data-outcome="won">Record WIN</button><button type="button" class="subtle" data-settle-id="'+id+'" data-outcome="lost">Record LOSS</button></div>'
     :"";
   return '<article class="mini-row library-item"><div><b>'+title+'</b><small>'+type+' · '+state+(date?' · '+new Date(date).toLocaleString():"")+'</small>'+(body?'<p>'+body.slice(0,550)+(body.length>550?'…':"")+'</p>':"")+'</div>'+couponActions+'</article>';
  }).join(""):'<div class="empty">No records in this collection yet. Import human coupons or run WIN research to build the library.</div>';
 }catch(e){
  $("#libraryStatus").textContent="Library unavailable: "+e.message;
  $("#libraryList").innerHTML='<div class="empty">Could not load the private WIN library.</div>';
 }
}
async function refresh(){
 try{
  const health=await fetch("/api/health").then(r=>r.json());
  $("#apiStatus").textContent=health.status==="online"?"API online":"API unavailable";
  const [runs,tips,preds]=await Promise.all([api("/api/runs"),api("/api/tips"),api("/api/predictions")]);
  $("#runCount").textContent=runs.length;$("#tipCount").textContent=tips.length;$("#predictionCount").textContent=preds.length;
  $("#workerCount").textContent=runs.reduce((n,r)=>n+(r.workers||[]).filter(w=>w.status==="completed").length+(r.debate||[]).filter(w=>w.status==="completed").length,0);
  $("#runsList").innerHTML=runs.length?runs.slice().reverse().map(r=>{const d=r.decision||r.master?.report||r.status;return '<div class="run-row"><div><b>'+escapeHtml(r.brief?.event||r.id)+'</b><small>'+escapeHtml(r.brief?.taskType||"research_event")+' · '+escapeHtml(r.status)+' · '+new Date(r.createdAt).toLocaleString()+' · '+((r.workers||[]).length)+' departments</small></div><span class="decision '+decisionClass(d)+'">'+escapeHtml(String(d).slice(0,32))+'</span><button class="subtle run-open" data-run-id="'+escapeHtml(r.id)+'">Open report</button></div>'}).join(""):'<div class="empty">No investigations yet. Start the first WIN run above.</div>';
  $("#tipsList").innerHTML=tips.length?tips.slice().reverse().slice(0,8).map(t=>'<div class="mini-row"><div><b>'+escapeHtml(t.tip.slice(0,110))+'</b><small>'+escapeHtml(t.tipster||t.sourceName)+' · '+escapeHtml(t.status)+'</small></div></div>').join(""):'<div class="empty">No human tips imported.</div>';
  $("#ledgerList").innerHTML=preds.length?preds.slice().reverse().slice(0,8).map(p=>'<div class="mini-row"><div><b>'+escapeHtml(p.brief?.event||p.id)+'</b><small>Frozen '+new Date(p.recordedAt).toLocaleString()+'</small></div><span class="decision">'+(p.frozen?"FROZEN":"")+'</span></div>').join(""):'<div class="empty">No frozen predictions yet.</div>';
  if(selectedRunId){
    const current=await api("/api/runs/"+encodeURIComponent(selectedRunId));
    renderRunDetail(current);
  }
  $("#mcpStatus").textContent="OAuth MCP endpoint deployed; plugin authorization test pending";
  await refreshLibrary();
 }catch(e){$("#apiStatus").textContent="Authentication needed";$("#runsList").textContent=e.message}
}
$("#saveToken").addEventListener("click",e=>{e.preventDefault();token=$("#tokenInput").value.trim();if(token){sessionStorage.setItem("win-token",token);dialog.close();refresh()}});
$("#runForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const form=e.currentTarget;
 const b=e.submitter||form.querySelector('[type="submit"]');
 if(b){b.disabled=true;b.textContent="Queuing…"}
 const f=new FormData(form);
 const target=String(f.get("targetCombinedOdds")||"").trim();
 const legs=String(f.get("maxLegs")||"").trim();
 const payload={
  taskType:f.get("taskType")||"build_latest_coupon",
  event:f.get("event")||undefined,
  sport:f.get("sport")||undefined,
  competition:f.get("competition")||undefined,
  dateTime:f.get("dateTime")||undefined,
  markets:String(f.get("markets")||"").split(",").map(s=>s.trim()).filter(Boolean),
  context:f.get("context")||"",
  existingCoupon:f.get("existingCoupon")||undefined,
  targetCombinedOdds:target?Number(target):undefined,
  maxLegs:legs?Number(legs):undefined
 };
 try{
  const data=await api("/api/runs",{method:"POST",body:JSON.stringify(payload)});
  form.reset();
  alert("WIN run queued: "+data.runId);
  await refresh();
  await openRun(data.runId);
 }catch(err){alert(err.message)}
 finally{if(b){b.disabled=false;b.innerHTML='Launch research <b>↗</b>'}}
});
$("#tipForm").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);try{await api("/api/tips",{method:"POST",body:JSON.stringify({tip:f.get("tip"),sourceUrl:f.get("sourceUrl"),tipster:f.get("tipster")})});form.reset();await refresh()}catch(err){alert(err.message)}});
$("#runsList").addEventListener("click",e=>{const b=e.target.closest("[data-run-id]");if(b)openRun(b.dataset.runId)});
$("#refresh").addEventListener("click",refresh);
$("#couponForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const form=e.currentTarget;
 const f=new FormData(form);
 const b=form.querySelector("button[type=\"submit\"]");
 if(b){b.disabled=true;b.textContent="Saving…"}
 try{
  const result=await api("/api/library",{method:"POST",body:JSON.stringify({
   action:"save_coupon",label:f.get("label"),couponText:f.get("couponText"),
   notes:f.get("notes"),origin:"human",outcome:"pending",bookmaker:"STS (user supplied)"
  })});
  form.reset();
  alert("Coupon saved in WIN pending library: "+result.id);
  await refreshLibrary();
 }catch(err){alert(err.message)}
 finally{if(b){b.disabled=false;b.textContent="Save human coupon to library"}}
});
$("#refreshLibrary").addEventListener("click",refreshLibrary);
$("#libraryCategory").addEventListener("change",refreshLibrary);
$("#libraryQuery").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();refreshLibrary()}});
$("#libraryList").addEventListener("click",async e=>{
 const button=e.target.closest("[data-settle-id]");
 if(!button)return;
 const settlementSource=prompt("Enter the result or settlement source (URL/reference) to support this classification:");
 if(!settlementSource||!settlementSource.trim())return;
 button.disabled=true;
 try{
  await api("/api/library",{method:"POST",body:JSON.stringify({
   action:"settle_coupon",couponId:button.dataset.settleId,
   outcome:button.dataset.outcome,settlementSource:settlementSource.trim(),
   evidence:[{type:"user_supplied_settlement_reference",reference:settlementSource.trim()}]
  })});
  await refreshLibrary();
 }catch(err){alert(err.message);button.disabled=false}
});

if(!token)dialog.showModal();else refresh();
setInterval(()=>{if(token&&!document.hidden)refresh()},20000);
