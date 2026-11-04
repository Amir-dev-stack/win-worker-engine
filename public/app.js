const $=s=>document.querySelector(s);
let token=sessionStorage.getItem("win-token")||"";
let reviewerToken=sessionStorage.getItem("win-reviewer-token")||"";
let selectedRunId=null;
let knownBudgetAlertIds=new Set();
const dialog=$("#tokenDialog");
function headers(){return {"content-type":"application/json","authorization":"Bearer "+token}}
async function api(path,options={}){const r=await fetch(path,{...options,headers:{...headers(),...(options.headers||{})}});if(r.status===401){if(!dialog.open)dialog.showModal();throw new Error("Connect using your WIN internal token.");}const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Request failed ("+r.status+")");return data}
async function reviewerApi(path,options={}){const r=await fetch(path,{...options,headers:{"content-type":"application/json","authorization":"Bearer "+reviewerToken,...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Reviewer request failed ("+r.status+")");return data}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function decisionClass(text=""){const t=String(text).toUpperCase();return t.includes("NO BET")?"no":t.includes("BET")?"bet":"wait"}
function safeUrl(value){try{const u=new URL(value);return ["https:","http:"].includes(u.protocol)?u.href:""}catch{return ""}}
function citationHtml(items=[]){return items.map(c=>{const u=safeUrl(c.url);return u?'<a href="'+escapeHtml(u)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(c.title||u)+'</a>':""}).filter(Boolean).join("")}
function couponPanel(coupons=[]){
 if(!coupons.length)return '<section class="report-card"><b>Constructed coupons</b><p class="empty">No structured coupon candidate was returned. Check D6 report and evidence blockers.</p></section>';
 return '<section class="report-card"><h4>Coupon candidates — your decision</h4>'+coupons.map(c=>{
  const legs=(c.legs||[]).map((l,i)=>'<tr><td>'+(i+1)+'. '+escapeHtml(l.event)+'</td><td>'+escapeHtml(l.market)+'<br><b>'+escapeHtml(l.selection)+'</b></td><td>'+(l.odds===null||l.odds===undefined?'Not verified':Number(l.odds).toFixed(2))+'</td><td>'+(l.sourceUrl?'<a href="'+escapeHtml(safeUrl(l.sourceUrl))+'" target="_blank" rel="noopener noreferrer">Source ↗</a>':'Not supplied')+'<br><small>'+escapeHtml(l.observedAt||'No timestamp')+'</small></td></tr>').join('');
  const blockers=(c.blockers||[]).length?'<p class="report-error"><b>Evidence gaps / blockers:</b> '+escapeHtml(c.blockers.join(' · '))+'</p>':'';
  const corr=(c.correlationNotes||[]).length?'<p><b>Correlation:</b> '+escapeHtml(c.correlationNotes.join(' · '))+'</p>':'';
  const risk=(c.riskFactors||[]).length?'<p><b>Risk factors:</b> '+escapeHtml(c.riskFactors.join(' · '))+'</p>':'';
  return '<article class="mini-row"><div><div class="report-title"><b>'+escapeHtml(c.label||'WIN candidate')+'</b><span class="decision">'+escapeHtml(c.status||'UNASSESSED')+'</span></div><p>Combined odds: <b>'+(c.combinedOdds?Number(c.combinedOdds).toFixed(2):'Not verified')+'</b></p><div class="table-wrap"><table><thead><tr><th>Event</th><th>Market / selection</th><th>Odds</th><th>Price evidence</th></tr></thead><tbody>'+legs+'</tbody></table></div>'+blockers+corr+risk+'</div></article>';
 }).join('')+'</section>';
}
function riskPanel(risk,master){
 if(!risk)return '<section class="report-card"><h4>Global Master — risk only</h4><p class="empty">Risk percentage unavailable. '+escapeHtml((master&&master.report)||'Required evidence or assessment was incomplete.')+'</p><p>The final betting decision remains yours.</p></section>';
 const pct=Number(risk.overallRiskPercent);
 const components=(risk.components||[]).map(x=>'<li>'+escapeHtml(x.factor)+': '+(x.riskPercent===null?'Unscored':Number(x.riskPercent).toFixed(0)+'%')+' · weight '+Number(x.weightPercent||0)+'%</li>').join('');
 return '<section class="report-card"><h4>Global Master — risk assessment only</h4><div class="risk-score">'+(Number.isFinite(pct)?pct.toFixed(0)+'%':'Unavailable')+'</div><b>Estimated overall risk score</b><p>'+escapeHtml(risk.method||'Method not supplied.')+'</p><p><b>Scale:</b> '+escapeHtml(risk.riskScale||'0–100, higher means riskier')+'</p><p><b>Important:</b> This is a heuristic score, not a calibrated probability of losing.</p>'+(components?'<h5>Risk components</h5><ul>'+components+'</ul>':'')+((risk.topRiskDrivers||[]).length?'<p><b>Main risk drivers:</b> '+escapeHtml(risk.topRiskDrivers.join(' · '))+'</p>':'')+((risk.uncertainties||[]).length?'<p><b>Uncertainties:</b> '+escapeHtml(risk.uncertainties.join(' · '))+'</p>':'')+'<p><b>You make the final decision.</b> WIN does not place bets or decide for you.</p></section>';
}
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
 const agentQueue=network.agentQueue||{};
 const nodes=network.nodes||[];
 const departments=nodes.filter(n=>n.tier==="MAIN_DEPARTMENT");
 const tiers=["T1","T2","T3","T4","T5","T6","T7"];
 const labels={T1:"Sport agents",T2:"Country agents",T3:"League / competition agents",T4:"Club / team agents",T5:"Player / athlete agents",T6:"Match / event agents",T7:"Event specialist assignments"};
 const tierHtml=tiers.map(t=>{
   const selected=nodes.filter(n=>n.tier===t);
   return '<h5>'+labels[t]+' ('+selected.length+')</h5>'+(selected.length?selected.slice(0,60).map(n=>'<div class="network-row"><span>'+escapeHtml(n.name)+'</span><small>'+escapeHtml(n.status)+'</small></div>').join(""):'<div class="empty">No verified or supplied nodes in this tier.</div>');
 }).join("");
 const deptHtml=departments.map(n=>'<div class="network-row"><span>'+escapeHtml(n.name)+'</span><small>'+escapeHtml(n.status)+'</small></div>').join("");
 const apiText=summary.actualApiSessions!==undefined
   ?summary.actualApiSessions+" actual model API sessions ("+summary.completedDepartmentReports+" department reports, "+summary.completedDebateReports+" completed challenge reports)"
   :"Department and challenge execution details are still pending.";
 return '<section class="network-panel"><div class="report-title"><b>WIN worker network</b><span class="decision">'+escapeHtml(network.runId||"Run")+'</span></div><p>'+escapeHtml(network.executionDisclosure||"")+'</p><div class="network-stats"><span>'+Number(counts.sports||0)+' sports</span><span>'+Number(counts.sportCountryBranches||0)+' sport/country nodes</span><span>'+Number(counts.competitions||0)+' competitions</span><span>'+Number(counts.clubs||0)+' club agents</span><span>'+Number(counts.players||0)+' player agents</span><span>'+Number(counts.events||0)+' events</span><span>'+Number(counts.eventSpecialistAssignments||0)+' specialist assignments</span></div><h5>Eight main departments</h5>'+deptHtml+'<h5>Independent worker hierarchy</h5>'+tierHtml+'<p class="detail-meta">'+escapeHtml(apiText)+'</p><p class="detail-meta">Persistent agents queued: '+Number(agentQueue.queued||0)+' new tasks · '+Number(agentQueue.alreadyActive||0)+' already active · '+Number(agentQueue.freshProfile||0)+' recently refreshed. One separate entity-agent API task is processed per budget-approved four-hour learning cycle. These are queued tasks, not always-on agents.</p><p class="detail-meta">Mandatory library review: '+escapeHtml(network.libraryReviewGate?.status||"pending")+(network.libraryReviewGate?.failures?.length?" · "+escapeHtml(network.libraryReviewGate.failures.join("; ")):"")+'</p></section>';
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
 const master=riskPanel(run.riskAssessment,run.master);
 const coupons=couponPanel(run.coupons||[]);
 const existing=run.brief?.existingCoupon?'<h4>Coupon under review</h4><pre>'+escapeHtml(run.brief.existingCoupon)+'</pre>':"";
 const error=run.error?'<p class="report-error">'+escapeHtml(run.error)+'</p>':"";
 node.innerHTML='<div class="detail-head"><div><div class="eyebrow">SELECTED INVESTIGATION</div><h3>'+title+'</h3>'+brief+'</div><button class="subtle" id="closeRunDetail">Close</button></div>'+networkPanel(run.workerNetwork)+existing+'<h4>Eight department reports ('+workers.length+')</h4>'+cards+'<h4>Independent adversarial review ('+debate.length+')</h4>'+challengeCards+coupons+master+error;
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
function renderCouponBoardCard(item, mode) {
 const title=escapeHtml(item.label||item.id||"WIN coupon");
 const origin=escapeHtml(item.origin==="win"?"WIN-built":"Human / imported");
 const state=escapeHtml(mode==="candidate"?(item.status||"BLOCKED"):(item.outcome||"pending").toUpperCase());
 const date=item.settledAt||item.createdAt||item.archivedAt||item.updatedAt;
 const odds=item.combinedOdds===null||item.combinedOdds===undefined?"Not verified":Number(item.combinedOdds).toFixed(2);
 const selections=Array.isArray(item.legs)?item.legs:(Array.isArray(item.selections)?item.selections:[]);
 const rows=selections.map((selection,index)=>{
  const event=escapeHtml(selection.event||selection.match||"Event not specified");
  const market=escapeHtml(selection.market||selection.selectionType||"Market not specified");
  const pick=escapeHtml(selection.selection||selection.pick||selection.outcome||"Pick not specified");
  const price=selection.odds===null||selection.odds===undefined?"—":Number(selection.odds).toFixed(2);
  const result=escapeHtml(selection.result||selection.settlement||"—");
  const url=safeUrl(selection.sourceUrl||selection.url||selection.reference||"");
  const source=url?'<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">Evidence ↗</a>':"Not supplied";
  const observed=selection.observedAt?'<small>'+escapeHtml(selection.observedAt)+'</small>':"";
  return '<tr><td>'+(index+1)+'</td><td>'+event+'</td><td>'+market+'<br><b>'+pick+'</b></td><td>'+price+'</td><td>'+result+'</td><td>'+source+observed+'</td></tr>';
 }).join("");
 const table=rows?'<div class="table-wrap"><table><thead><tr><th>#</th><th>Event</th><th>Market / pick</th><th>Odds</th><th>Result</th><th>Source</th></tr></thead><tbody>'+rows+'</tbody></table></div>':"";
 const text=item.couponText?'<pre>'+escapeHtml(item.couponText)+'</pre>':"";
 const blockers=Array.isArray(item.blockers)&&item.blockers.length?'<p class="report-error"><b>Blockers:</b> '+escapeHtml(item.blockers.join(" · "))+'</p>':"";
 const note=item.executionDisclosure||item.notes||item.settlementReviewStatus||"";
 const placement=item.executionStatus==="not_placed_by_WIN"||item.placementStatus==="not_placed_by_WIN"
  ?'<p class="detail-meta">Research candidate only · not placed by WIN</p>':"";
 const details=table||text||blockers?'<details><summary>View full coupon ('+selections.length+' selections)</summary>'+table+text+blockers+'</details>':'<p class="detail-meta">No structured selections were stored for this record.</p>';
 return '<article class="coupon-board-card"><div class="report-title"><b>'+title+'</b><span class="decision">'+state+'</span></div><small>'+origin+' · '+escapeHtml(item.sport||"Sport unspecified")+' · '+escapeHtml(item.competition||"Competition unspecified")+(date?' · '+escapeHtml(new Date(date).toLocaleString()):"")+'</small><p>Combined odds: <b>'+odds+'</b> · '+selections.length+' selections</p>'+placement+(note?'<p class="detail-meta">'+escapeHtml(note)+'</p>':"")+details+'</article>';
}
async function refreshCouponBoards(){
 const status=$("#couponBoardStatus");
 if(!status)return;
 try{
  const [built,allCoupons,won,lost]=await Promise.all([
   api("/api/library?category=win-candidates&limit=40"),
   api("/api/library?category=coupons&limit=100"),
   api("/api/library?category=winning&limit=40"),
   api("/api/library?category=losing&limit=40")
  ]);
  const candidates=built.items||[];
  const candidateIds=new Set(candidates.map(item=>item.id));
  const legacyWinCoupons=(allCoupons.items||[]).filter(item=>item.origin==="win"&&!candidateIds.has(item.winCandidateId));
  const winBuiltItems=[...candidates,...legacyWinCoupons];
  const lists=[
   {id:"#winBuiltList",count:"#winBuiltCount",items:winBuiltItems,mode:"candidate",empty:"No WIN-built coupons archived yet. Build a coupon from the Research Runs section."},
   {id:"#wonCouponList",count:"#wonCouponCount",items:won.items||[],mode:"outcome",empty:"No coupons have a recorded won outcome yet."},
   {id:"#lostCouponList",count:"#lostCouponCount",items:lost.items||[],mode:"outcome",empty:"No coupons have a recorded lost outcome yet."}
  ];
  for(const list of lists){
   $(list.count).textContent=String(list.items.length);
   $(list.id).innerHTML=list.items.length?list.items.map(item=>renderCouponBoardCard(item,list.mode)).join(""):'<div class="empty">'+list.empty+'</div>';
  }
  status.textContent="Loaded "+winBuiltItems.length+" WIN-built candidates / legacy WIN records · "+(won.count||0)+" won · "+(lost.count||0)+" lost. Outcomes appear here after evidence is submitted.";
 }catch(error){status.textContent="Coupon boards could not be refreshed: "+error.message;}
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
 await refreshCouponBoards();
}
async function refreshSimulations(){
 const category=$("#simulationCategory")?.value||"runs";
 const runId=$("#simulationRunId")?.value.trim()||"";
 const params=new URLSearchParams({category});
 if(runId)params.set("runId",runId);
 try{
  const data=await api("/api/simulations?"+params.toString());
  const items=category==="runs"?data:(data.items||[]);
  $("#simulationLibraryStatus").textContent=category==="runs"?items.length+" simulation runs":(data.count||0)+" coupon records returned · showing up to 200";
  $("#simulationList").innerHTML=items.length?items.slice(0,50).map(item=>{
   if(category==="runs"){
    const summary=item.summary||{};
    return '<article class="mini-row"><div><b>'+escapeHtml(item.id)+'</b><small>'+escapeHtml(item.status)+' · '+Number(item.couponCount||0).toLocaleString()+' generated · '+Number(item.selectionCount||0).toLocaleString()+' historical picks</small><p>Wins '+Number(summary.won||0).toLocaleString()+' · Losses '+Number(summary.lost||0).toLocaleString()+' · Voids '+Number(summary.voided||0).toLocaleString()+' · ROI '+(summary.flatStakeRoi===undefined?"pending":(Number(summary.flatStakeRoi)*100).toFixed(2)+"%")+'</p>'+(item.error?'<p class="report-error">'+escapeHtml(item.error)+'</p>':"")+'</div><button class="subtle" type="button" data-sim-run="'+escapeHtml(item.id)+'">View outcomes</button></article>';
   }
   return '<article class="mini-row"><div><b>'+escapeHtml(item.id)+'</b><small>'+escapeHtml(item.outcome)+' · '+Number(item.legCount||0)+' legs · combined odds '+Number(item.combinedOdds||0).toFixed(2)+'</small><p>'+escapeHtml((item.selections||[]).map(x=>x.event+" — "+x.market+": "+x.pick+" ("+x.result+")").join(" · ").slice(0,700))+'</p></div></article>';
  }).join(""):'<div class="empty">No records in this simulation collection yet.</div>';
 }catch(e){$("#simulationLibraryStatus").textContent="Simulation library unavailable: "+e.message}
}
async function refreshCoverage(){
 try{
  const data=await api("/api/coverage");
  const domains=data.evidence?.domains||[];
  const sports=data.sports||[];
  const observed=sports.filter(x=>x.evidenceRecords>0).length;
  $("#coverageSummary").innerHTML='<div class="network-stats"><span>'+Number(data.evidence?.total||0)+' evidence records</span><span>'+observed+'/'+sports.length+' sports with evidence</span><span>'+domains.filter(x=>x.status==="fresh").length+'/'+domains.length+' fresh evidence domains</span><span>'+Number(data.humanIntelligence?.importedSourceRecords||0)+' human-source imports</span></div><p class="detail-meta">Generated '+escapeHtml(new Date(data.generatedAt).toLocaleString())+'. Counts reflect persisted WIN evidence only.</p>';
  const domainHtml=domains.map(x=>'<article class="mini-row"><div><b>'+escapeHtml(x.label)+'</b><small>'+Number(x.records||0)+' records · '+escapeHtml(x.status)+' · freshness limit '+Number(x.freshnessLimitHours||0)+'h</small><p>Latest: '+escapeHtml(x.latestRetrievedAt||"No timestamp")+'</p></div></article>').join("");
  const sportHtml=sports.map(x=>'<article class="mini-row"><div><b>'+escapeHtml(x.sport)+'</b><small>'+Number(x.evidenceRecords||0)+' evidence records · '+Number(x.observedDomains||0)+'/'+Number(x.requiredDomains||0)+' domains · '+escapeHtml(x.status)+'</small><p>'+x.domains.map(d=>escapeHtml(d.id)+': '+escapeHtml(d.status)).join(' · ')+'</p></div></article>').join("");
  $("#coverageList").innerHTML='<h4>Evidence domains</h4>'+domainHtml+'<h4>Sport-by-sport coverage</h4>'+sportHtml;
  await refreshSettlementQueue();
 }catch(e){$("#coverageSummary").textContent="Coverage unavailable: "+e.message}
}
async function refreshSettlementQueue(){
 try{
  const data=await api("/api/human-coupon-settlements?status=pending_independent_review");
  const items=data.items||[];
  $("#settlementQueue").innerHTML=items.length?'<h4>Pending independent review ('+items.length+')</h4>'+items.slice(0,30).map(x=>'<article class="mini-row"><div><b>'+escapeHtml(x.couponId)+'</b><small>'+escapeHtml(x.claimedOutcome)+' claimed · '+escapeHtml(x.reviewStatus)+' · '+escapeHtml(new Date(x.submittedAt).toLocaleString())+'</small><p>'+escapeHtml(x.evidenceSummary)+'</p><a href="'+escapeHtml(safeUrl(x.evidenceUrl))+'" target="_blank" rel="noopener noreferrer">Open evidence ↗</a></div></article>').join(""):'<div class="empty">No settlement evidence submissions awaiting review.</div>';
 }catch(e){$("#settlementQueue").textContent="Settlement queue unavailable: "+e.message}
}

function renderReviewerCase(item){
 const isHuman=item.caseType==="human_coupon",isWin=item.caseType==="win_coupon",isCoupon=isHuman||isWin;
 const title=isCoupon?(item.coupon?.label||item.coupon?.id||(isWin?"WIN coupon":"Human coupon")):((item.lesson?.title)||item.lesson?.id||"Lesson");
 const evidence=(item.evidence||[]).map(x=>typeof x==="string"?x:(x.url||x.reference||x.sourceUrl||x.evidenceUrl||"")).filter(Boolean);
 if(isCoupon){if(Array.isArray(item.sourceUrls))evidence.push(...item.sourceUrls);if(item.evidenceUrl)evidence.push(item.evidenceUrl);}
 const evidenceHtml=[...new Set(evidence)].map(url=>'<a href="'+escapeHtml(safeUrl(url))+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(url)+'</a>').join("<br>");
 const summary=isCoupon
  ?'<p><b>Current result:</b> '+escapeHtml(item.claimedOutcome||"not fully resolved")+' · <b>Origin:</b> '+(isWin?"WIN research forecast (not placed)":"human coupon")+' · <b>Sport:</b> '+escapeHtml(item.coupon?.sport||"unknown")+' · <b>Competition:</b> '+escapeHtml(item.coupon?.competition||"unknown")+'</p><pre>'+escapeHtml((item.coupon?.couponText||"").slice(0,3500))+'</pre>'
  :'<p><b>Lesson:</b> '+escapeHtml(item.lesson?.title||item.lesson?.id||"")+' · '+escapeHtml(item.lesson?.sport||"")+' '+escapeHtml(item.lesson?.competition||"")+'</p><p>'+escapeHtml(item.lesson?.note||"")+'</p>'+
   ((item.lesson?.matchResult)?'<p><b>Reviewed result:</b> '+escapeHtml(item.lesson.matchResult.homeTeam||"")+' '+escapeHtml(item.lesson.matchResult.homeScore??"")+"-"+escapeHtml(item.lesson.matchResult.awayScore??"")+' '+escapeHtml(item.lesson.matchResult.awayTeam||"")+'</p>':"")+
   ((item.lesson?.preMatchReports||[]).length?'<h5>Archived pre-match reports</h5>'+item.lesson.preMatchReports.map(r=>'<details><summary>'+escapeHtml(r.departmentId+" · "+(r.role||"Department"))+' ('+escapeHtml(r.status||"unknown")+')</summary><pre>'+escapeHtml(r.report||"")+'</pre>'+citationHtml(r.citations||[])+'</details>').join(""):'<p class="observatory-note">No archived D1/D2/D3/D4/D6/D8 reports were available for this run.</p>')+
   ((item.lesson?.diagnosticChecklist||[]).length?'<h5>Post-match change checklist</h5><ul>'+item.lesson.diagnosticChecklist.map(x=>'<li>'+escapeHtml(x)+'</li>').join("")+'</ul>':"");
 const leadHtml=isWin?(item.legs||[]).map((leg,i)=>{
  const status=["won","lost","void"].includes(String(leg.status))?String(leg.status):"unresolved";
  const known=["won","lost","void"].includes(String(leg.status));
  const leads=(leg.searchLeads||[]).map(x=>{
   const url=safeUrl(x.url);return url?'<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(x.title||x.sourceName||"Google search lead")+'</a>':"";
  }).filter(Boolean).join(" · ");
  const score=leg.homeScore!==undefined&&leg.awayScore!==undefined?" · score "+leg.homeScore+"-"+leg.awayScore:"";
  return '<div class="leg-review-card" data-leg-index="'+(i+1)+'"><b>Leg '+(i+1)+': '+escapeHtml(leg.event||"Event")+'</b><small>'+escapeHtml(leg.market||"")+' · '+escapeHtml(leg.pick||"")+' · automatic: '+escapeHtml(status)+escapeHtml(score)+'</small>'+(leg.reason?'<p>'+escapeHtml(leg.reason)+'</p>':"")+(leg.sourceUrl?'<small>Structured result: <a target="_blank" rel="noopener noreferrer" href="'+escapeHtml(safeUrl(leg.sourceUrl))+'">open result source ↗</a></small>':"")+(leads?'<p class="search-leads"><b>Google discovery leads (not proof):</b> '+leads+'</p>':"")+'<label>Reviewer result<select data-leg-result data-leg-index="'+(i+1)+'"><option value=""'+(known?"":" selected")+'>Choose result</option>'+(known?'<option value="keep" selected>Confirm automatic '+escapeHtml(status)+'</option>':"")+'<option value="won">Won</option><option value="lost">Lost</option><option value="void">Void</option></select></label><label>Independent HTTPS source for a manual result (required when changing/adding a result)<input type="url" data-leg-evidence data-leg-index="'+(i+1)+'" placeholder="https://official-source.example/…"></label></div>';
 }).join(""):'';
 const checks=isCoupon
  ?'<label class="check-row"><input type="checkbox" data-check="eventIdentityConfirmed"> Event identity confirmed</label><label class="check-row"><input type="checkbox" data-check="marketRulesConfirmed"> Market settlement rules confirmed</label><label class="check-row"><input type="checkbox" data-check="everySelectionReviewed"> Every coupon selection reviewed</label><label class="check-row"><input type="checkbox" data-check="evidenceIndependent"> Evidence independent of original result source</label>'
  :'<label class="check-row"><input type="checkbox" data-check="claimSupported"> Lesson claim is supported</label><label class="check-row"><input type="checkbox" data-check="independentEvidenceConfirmed"> Claim independently corroborated</label>';
 return '<article class="mini-row review-case" data-case-type="'+escapeHtml(item.caseType)+'" data-case-id="'+escapeHtml(item.id)+'"><div><div class="report-title"><b>'+escapeHtml(title)+'</b><span class="decision wait">PENDING REVIEW</span></div><small>'+escapeHtml(item.id)+' · '+escapeHtml(new Date(item.submittedAt).toLocaleString())+'</small>'+summary+(leadHtml?'<div class="leg-review-list">'+leadHtml+'</div>':"")+'<p><b>Submitted structured sources:</b><br>'+evidenceHtml+'</p>'+(isWin?'<p class="observatory-note">Google links are search leads only. They cannot establish the final score or betting-market settlement.</p>':"")+'</div><div class="review-form"><label>Reviewer name<input data-reviewer-name required minlength="2" placeholder="Your name"></label><label>Additional independent HTTPS corroboration URL<textarea data-reviewer-evidence rows="2" placeholder="https://independent-official-source.example/…" required></textarea></label>'+checks+'<label>Review notes<textarea data-reviewer-notes rows="3" minlength="40" placeholder="Explain the event, market and result checks, including any manual leg decisions." required></textarea></label><div class="form-foot"><button type="button" class="subtle" data-review-decision="reject">Reject</button><button type="button" data-review-decision="approve">Approve</button></div></div></article>';
}
async function refreshReviewerQueue(){
 if(!reviewerToken){$("#reviewerQueueStatus").textContent="Connect using the separate reviewer credential.";return;}
 try{
  const data=await reviewerApi("/api/independent-review");
  const lessons=data.lessonCases||[],humans=data.humanSettlementCases||[],winCoupons=data.winCouponCases||[];
  $("#reviewerQueueStatus").textContent=lessons.length+" lesson cases · "+humans.length+" human coupon settlements · "+winCoupons.length+" WIN post-match results awaiting review. A separate credential is not identity proof.";
  $("#reviewerQueue").innerHTML=(winCoupons.map(renderReviewerCase).join("")+humans.map(renderReviewerCase).join("")+lessons.map(renderReviewerCase).join(""))||'<div class="empty">No pending review cases.</div>';
 }catch(error){
  $("#reviewerQueueStatus").textContent="Reviewer queue unavailable: "+error.message;
  $("#reviewerQueue").innerHTML="";
 }
}


function renderSourceCandidates(candidates=[]){
 return candidates.slice(0,5).map(x=>{
  const url=safeUrl(x.sourceUrl);
  const reviewButton=x.reviewStatus==="review_required"&&x.licenseStatus==="open_data_license_candidate"?'<button class="subtle" data-source-review="approve_for_adapter_review" data-candidate-id="'+escapeHtml(x.id)+'">Approve for adapter review</button>':"";
  return '<article class="mini-row"><div><b>'+escapeHtml(x.name)+'</b><small>'+escapeHtml(x.license||"Licence missing")+' · '+escapeHtml(x.licenseStatus||"unverified")+' · '+escapeHtml((x.sports||[]).join(", ")||"sport unclassified")+' · '+escapeHtml(x.reviewStatus||"review required")+'</small></div>'+(url?'<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener">Source</a>':'')+reviewButton+'</article>';
 }).join("");
}

async function refreshResearch(){
 try{
  const d=await api("/api/research-status");
  const providers=(d.providers||[]).map(p=>'<article class="mini-row"><div><b>'+escapeHtml(p.name)+'</b><small>'+escapeHtml(p.status||"unknown")+' · '+escapeHtml(p.accessMode||"")+' · licence '+escapeHtml(p.licenceReview||"unverified")+'</small></div></article>').join("");
  const open=d.openfootball||{},worldCup=d.openfootballWorldCup||{},cons=d.consensus||{},sharp=d.sharpapi||{},lab=d.modelLab||{},agents=d.persistentAgents||{},cal=d.calibration?.latest||{},settlement=d.observedMarketSettlement||{},bridge=settlement.latest||{},sim=bridge.simulation?.summary||{},discovery=d.sourceDiscovery||{},evolution=d.agentEvolution||{};
  const couponSims=(cal.reports||[]).flatMap(r=>r.couponSimulation?.results||[]);
  const candidateRows=renderSourceCandidates(discovery.topCandidates||[]);
  const sections=[
   '<article class="mini-row"><div><b>OpenFootball historical results</b><small>'+escapeHtml(open.status||"not yet run")+' · '+Number(open.totals?.matchesImported||0).toLocaleString()+' matches imported · last check '+escapeHtml(open.lastCheck||"not yet")+'</small></div></article>',
   '<article class="mini-row"><div><b>World Cup history and player events</b><small>'+escapeHtml(worldCup.status||"not yet run")+' · '+Number(lab.worldCupMatchCount||0).toLocaleString()+' matches · '+Number(lab.playerEventRows||0).toLocaleString()+' player events · '+Number(lab.worldCupDatasetCount||0)+' tournament datasets</small></div></article>',
   '<article class="mini-row"><div><b>Consensus market history</b><small>'+escapeHtml(cons.status||"not yet run")+' · '+Number(lab.consensusMarketRows||0).toLocaleString()+' rows · '+Number(lab.consensusSettledRows||0).toLocaleString()+' settled events</small></div></article>',
   '<article class="mini-row"><div><b>SharpAPI multi-source snapshots</b><small>'+escapeHtml(sharp.status||"not yet run")+' · '+Number(lab.observedMarketRows||0).toLocaleString()+' observed prices · '+Number(lab.observedMarketFamilies?.length||0)+' market families</small></div></article>',
   '<article class="mini-row"><div><b>Market calibration lab</b><small>'+escapeHtml(cal.status||"waiting for first report")+' · '+Number(cal.totalEvents||0).toLocaleString()+' events · '+Number(cal.reports?.length||0)+' dataset reports · consensus benchmark only · '+Number(couponSims.length||0)+' coupon simulation bands</small></div></article>',
   '<article class="mini-row"><div><b>Settled bookmaker prices → existing simulation</b><small>'+escapeHtml(settlement.status||"not yet run")+' · '+Number(bridge.snapshotRows||0).toLocaleString()+' snapshot rows → '+Number(bridge.eligiblePreMatchRows||0).toLocaleString()+' eligible pre-match → '+Number(settlement.settledSelections||0).toLocaleString()+' settled selections · '+Number(settlement.uniqueEvents||0)+' events · '+(sim.flatStakeRoi!==undefined?'descriptive historical ROI '+(Number(sim.flatStakeRoi)*100).toFixed(1)+'%':'simulation pending')+' · not a predictive edge</small></div></article>',
   '<article class="mini-row"><div><b>Agent proposal and sandbox readiness</b><small>'+Number(evolution.proposalCount||0)+' proposals · '+Number(evolution.readyForHumanSandboxApproval||0)+' ready for human sandbox approval · '+Number(evolution.blocked||0)+' blocked by missing data/evidence · '+Number(evolution.sandboxEvaluations||0)+' readiness checks · '+Number(evolution.productionAgentsCreated||0)+' production agents auto-created</small></div></article>',
   '<article class="mini-row"><div><b>Public source discovery</b><small>'+escapeHtml(discovery.status||"not yet run")+' · '+Number(discovery.totalCandidates||0)+' candidates · '+Number(discovery.openLicenseCandidates||0)+' open-license candidates · '+Number(discovery.reviewRequired||0)+' awaiting review · last check '+escapeHtml(discovery.lastCheck||"not yet")+'</small></div></article>',
   '<article class="mini-row"><div><b>Persistent entity agents</b><small>'+Number(agents.profiles||0)+' profiles · '+Number(agents.queued||0)+' queued · '+Number(agents.running||0)+' running · '+Number(agents.completed||0)+' completed · '+Number(agents.failed||0)+' failed</small></div></article>'
  ];
  $("#researchEngineStatus").innerHTML='<h4>Data providers</h4>'+providers+'<h4>Pipeline status</h4>'+sections.join("")+'<h4>Discovered public source candidates</h4>'+(candidateRows||'<div class="empty">No candidates discovered yet.</div>')+'<p class="detail-meta">Discovered sources remain review-only. Approving a source for adapter review does not connect or activate automatic ingestion. Human Coupon Lab remains isolated. AI entity agents execute one queued task per four-hour cycle only when the OpenAI key, model and explicit budget approval gates allow it.</p>';
  $("#researchEngineStatus").querySelectorAll("[data-source-review]").forEach(btn=>btn.addEventListener("click",async()=>{
   btn.disabled=true;
   try{await api("/api/research-source-candidates",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({candidateId:btn.dataset.candidateId,decision:btn.dataset.sourceReview,reviewNote:"Approved for adapter design only; independently verify source terms and schema before activation."})});await refreshResearch();}
   catch(e){btn.disabled=false;alert(e.message);}
  }));

  $("#researchEngineStatus").querySelectorAll("[data-source-review]").forEach(btn=>btn.addEventListener("click",async()=>{
   btn.disabled=true;
   try{
    await api("/api/research-source-candidates",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({candidateId:btn.dataset.candidateId,decision:btn.dataset.sourceReview,reviewNote:"Approved for adapter design only; verify source terms and schema before enabling ingestion."})});
    await refreshResearch();
   }catch(e){btn.disabled=false;alert(e.message);}
  }));

 }catch(e){$("#researchEngineStatus").innerHTML='<div class="empty">Research status unavailable: '+escapeHtml(e.message)+'</div>';}
}

function money(value){return "$"+Number(value||0).toFixed(2)}
function updateBudgetNotificationButton(){
 const notify=$("#budgetNotifications");
 if(!("Notification" in window)){notify.textContent="Desktop alerts unsupported";notify.disabled=true;return;}
 notify.textContent=Notification.permission==="granted"?"Desktop alerts enabled":Notification.permission==="denied"?"Desktop alerts blocked by browser":"Enable desktop alerts";
 notify.disabled=Notification.permission==="denied";
}
function renderAIBudget(data){
 const enabled=true;
 $("#budgetStateTag").textContent=data.spendingLocked?"OWNER LOCKED":"LIMIT ENFORCED";
 $("#budgetLockStatus").className="budget-alert "+(data.spendingLocked?"level-limit_reached":"empty");
 $("#budgetLockStatus").textContent=data.spendingLocked?("SPENDING LOCKED · "+(data.lockReason||"Owner approval required.")+" Locked at "+(data.lockedAt?new Date(data.lockedAt).toLocaleString():"unknown")+" · No automatic monthly reset."):("Spending is permitted under the enforced cap. Owner unlock history: "+(data.lastOwnerApprovalAt?new Date(data.lastOwnerApprovalAt).toLocaleString():"none recorded")+".");
 $("#ownerUnlockBudget").disabled=!data.spendingLocked;
 $("#budgetSpent").textContent=money(data.spentUsd);
 $("#budgetSpendMeta").textContent=(data.month||"Current month")+" · tracked "+money(data.totalTrackedUsd);
 $("#budgetReserved").textContent=money(data.reservedUsd);
 $("#budgetLimitAmount").textContent=money(data.operatingStopUsd||2.95);
 $("#budgetRemaining").textContent=(data.spendingLocked?"Spending locked · remaining":"Remaining before automatic lock")+" "+money(data.remainingUsd);
 $("#budgetCalls").textContent=Number(data.calls||0).toLocaleString();
 $("#budgetBlocked").textContent="Blocked before API call: "+Number(data.blockedCalls||0).toLocaleString();
 const alerts=data.alerts||[];
 const latest=alerts[0];
 $("#budgetLatestAlert").className="budget-alert "+(latest?("level-"+latest.level):"empty");
 $("#budgetLatestAlert").innerHTML=latest
  ?'<b>'+escapeHtml(latest.level.replaceAll("_"," ").toUpperCase())+'</b><span>'+escapeHtml(latest.message)+'</span><small>'+new Date(latest.createdAt).toLocaleString()+' · estimated tracked spend '+money(latest.estimatedTotalUsd)+'</small>'
  :(enabled?"No budget alarm recorded yet. WIN will alert at 80%, 95% and the $2.95 operating stop.":"No budget alarm recorded yet. WIN is tracking usage without enforcing its internal cap.");
 $("#budgetAlertHistory").innerHTML=alerts.length?alerts.map(a=>'<article class="budget-alert-row"><span class="decision '+(a.level==="limit_reached"?"no":a.level==="critical"?"wait":"")+'">'+escapeHtml(a.level.replaceAll("_"," "))+'</span><div><b>'+escapeHtml(a.message)+'</b><small>'+new Date(a.createdAt).toLocaleString()+' · '+money(a.estimatedTotalUsd)+'</small></div></article>').join(""):'<div class="empty">No alerts this month.</div>';
 updateBudgetNotificationButton();
}
function announceBudgetAlerts(alerts){
 for(const alert of (alerts||[])){
  if(knownBudgetAlertIds.has(alert.id))continue;
  const created=Date.parse(alert.createdAt||"");
  const recent=Number.isFinite(created)&&Date.now()-created<15*60*1000;
  if(recent&&["critical","limit_reached"].includes(alert.level)&&"Notification" in window&&Notification.permission==="granted"){
   try{new Notification("WIN AI budget alarm",{body:alert.message,tag:alert.key||alert.id});}catch{}
  }
  knownBudgetAlertIds.add(alert.id);
 }
}
async function refreshAIBudget(){
 try{
  const data=await api("/api/ai-budget");
  renderAIBudget(data);
  announceBudgetAlerts(data.alerts||[]);
 }catch(error){
  $("#budgetStateTag").textContent="UNAVAILABLE";
  $("#budgetLatestAlert").className="budget-alert level-critical";
  $("#budgetLatestAlert").textContent="Could not load budget status: "+error.message;
 }
}
function learningLabel(value){
 const map={locked:"LOCKED",enabled:"ENABLED",not_yet_run:"NOT YET RUN",completed:"COMPLETED",partial:"PARTIAL",failed:"FAILED",
 credential_not_created:"REVIEWER NOT SET UP",credential_created_waiting_for_review:"WAITING FOR REVIEW",
 review_recorded:"REVIEW RECORDED",higher_than_previous_30_days:"HIGHER THAN PRIOR PERIOD",
 lower_than_previous_30_days:"LOWER THAN PRIOR PERIOD",similar_to_previous_30_days:"SIMILAR TO PRIOR PERIOD",
 insufficient_verified_sample:"NOT ENOUGH VERIFIED DATA"};
 return map[value]||String(value||"UNKNOWN").replaceAll("_"," ").toUpperCase();
}
async function refreshLearning(){
 try{
  const data=await api("/api/learning-observatory");
  const l=data.learning||{},p=data.postMatch||{},r=data.reviewer||{},s=data.openSources||{};
  $("#postMatchStatus").textContent=learningLabel(p.status);
  $("#postMatchUpdated").textContent=(p.lastCheck?"Checked "+new Date(p.lastCheck).toLocaleString():"No scheduled check recorded")+" · "+Number(p.awaitingIndependentReview||0)+" awaiting review · Google "+(p.googleSearchMode==="google_programmable_search_api"?"Google Search API":"Google News RSS")+" · "+Number(p.googleLeadsFound||0)+" leads";
  $("#learningAiStatus").textContent=learningLabel(data.liveResearch?.status);
  $("#learningReviewerStatus").textContent=learningLabel(r.status);
  $("#learningReviewerNote").textContent=Number(r.pendingCases||0)+" review cases pending · "+Number(r.completedOperations||0)+" completed review operations";
  $("#learningSourcesStatus").textContent=learningLabel(s.status);
  $("#learningSourcesNote").textContent=Number(s.totalCandidates||0).toLocaleString()+" public source metadata candidates";
  $("#learningWins").textContent=Number(l.verifiedWins||0).toLocaleString();
  $("#learningLosses").textContent=Number(l.verifiedLosses||0).toLocaleString();
  $("#learningValidatedLessons").textContent=Number(l.independentlyValidatedLessons||0).toLocaleString();
  $("#learningCandidateLessons").textContent=Number(l.candidateLessons||0).toLocaleString();
  $("#learningPendingReviews").textContent=Number(r.pendingCases||0).toLocaleString();
  $("#learningWinRate").textContent=l.verifiedCouponWinRate===null?"Not measurable":Number(l.verifiedCouponWinRate).toFixed(1)+"%";
  let trend="Trend: "+learningLabel(l.performanceTrend)+".";
  if(l.recent30Day?.count>=10&&l.prior30Day?.count>=10)trend+=" Previous 30 days "+l.prior30Day.winRate+"% ("+l.prior30Day.count+"); latest 30 days "+l.recent30Day.winRate+"% ("+l.recent30Day.count+").";
  else trend+=" At least 10 reviewed outcomes in each of the two 30-day periods are needed before comparing.";
  $("#learningTrend").textContent=trend;
  $("#learningCaveat").textContent=l.trendCaveat||"Whole-coupon descriptive rate only; not selection accuracy or profitability.";
  const mistakes=l.mistakes||[];
  $("#learningMistakes").innerHTML=mistakes.length?mistakes.map(x=>{
   const urls=(x.evidence||[]).map(e=>typeof e==="string"?e:e.url||e.reference||"").filter(Boolean);
   return '<article class="observatory-entry"><b>'+escapeHtml(x.title||"Post-match review")+'</b><p>'+escapeHtml(x.note||"")+'</p><small>'+escapeHtml(x.sport||"")+' · '+escapeHtml(x.competition||"")+' · reviewed '+escapeHtml(x.reviewedAt||"")+'</small><div>'+urls.map(u=>'<a target="_blank" rel="noopener noreferrer" href="'+escapeHtml(safeUrl(u))+'">Evidence ↗</a>').join("")+'</div></article>';
  }).join(""):'<div class="empty">No independently validated post-match mistake lessons yet. Candidate diagnoses remain outside trusted learning until review.</div>';
  const recent=p.recent||[];
  $("#postMatchRecent").innerHTML=recent.length?recent.slice(0,10).map(x=>{
   const state=x.status==="independently_reviewed"?learningLabel(x.outcome):learningLabel(x.status)+(x.outcome?" · CLAIMED "+learningLabel(x.outcome):"");
   const lost=(x.legs||[]).filter(z=>z.status==="lost").length;
   const unresolved=(x.legs||[]).filter(z=>!["won","lost","void"].includes(z.status)).length;
   return '<article class="observatory-entry"><b>'+escapeHtml(x.couponId||x.id)+' · '+escapeHtml(state)+'</b><p>'+Number(x.legCount||0)+' legs · '+lost+' lost · '+unresolved+' unresolved/unsupported · '+escapeHtml(x.updatedAt||"")+'</p>'+((x.legs||[]).slice(0,4).map(z=>'<small>'+escapeHtml(z.event||"Event")+' — '+escapeHtml(z.status||"unresolved")+(z.homeScore!==undefined?" ("+z.homeScore+"-"+z.awayScore+")":"")+'</small><br>').join(""))+'</article>';
  }).join(""):'<div class="empty">No post-match follow-up records yet.</div>';
  const d=data.datasets||{};
  const counts=[
   ["Historical match datasets",d.historicalEventDatasets,d.scoredEventRows+" scored rows"],
   ["Consensus market datasets",d.consensusDatasets,d.consensusMarketRows+" rows"],
   ["Player-event datasets",d.playerEventDatasets,d.playerEventRows+" rows"],
   ["Observed price snapshots",d.observedMarketSnapshots,d.observedMarketRows+" prices"],
   ["Settled market observations",d.settledObservedMarketDatasets,d.settledObservedMarketRows+" selections"],
   ["Calibration reports",d.calibrationReports,"chronological benchmark reports"],
   ["Open-licence candidates",s.openLicenseCandidates,"metadata only; review still required"],
   ["WIN post-match checks",p.totalCoupons,(p.awaitingIndependentReview||0)+" awaiting review"]
  ];
  $("#learningDataSources").innerHTML=counts.map(([title,note,detail])=>'<article class="observatory-data-item"><b>'+Number(note||0).toLocaleString()+'</b><small>'+escapeHtml(String(title))+' · '+escapeHtml(String(detail||""))+'</small></article>').join("");
  $("#learningDepartments").innerHTML=(data.system?.departments||[]).map(d=>{
   const cls=d.status==="passed"?"bet":d.status==="not_tested"?"wait":"no";
   return '<article class="observatory-department"><b>'+escapeHtml(d.id+" · "+d.name)+'</b><small>'+(d.lastTestAt?escapeHtml(new Date(d.lastTestAt).toLocaleString()):"No recorded smoke test")+'</small><span class="decision '+cls+'">'+escapeHtml(learningLabel(d.status))+'</span></article>';
  }).join("");
  $("#learningUpdated").textContent="Updated "+new Date(data.generatedAt).toLocaleString();
 }catch(error){
  $("#learningUpdated").textContent="Monitor unavailable: "+error.message;
  $("#postMatchStatus").textContent="STATUS UNAVAILABLE";
 }
}
async function refresh(){
 try{
  const health=await fetch("/api/health").then(r=>r.json());
  $("#apiStatus").textContent=health.status==="online"?"API online":"API unavailable";
  const [runs,tips,preds]=await Promise.all([api("/api/runs"),api("/api/tips"),api("/api/predictions")]);
  $("#runCount").textContent=runs.length;$("#tipCount").textContent=tips.length;$("#predictionCount").textContent=preds.length;
  $("#workerCount").textContent=runs.reduce((n,r)=>n+(r.workers||[]).filter(w=>w.status==="completed").length+(r.debate||[]).filter(w=>w.status==="completed").length,0);
  $("#runsList").innerHTML=runs.length?runs.slice().reverse().map(r=>{const d=r.riskAssessment&&typeof r.riskAssessment.overallRiskPercent==="number"?"Risk "+Number(r.riskAssessment.overallRiskPercent).toFixed(0)+"%":r.status;return '<div class="run-row"><div><b>'+escapeHtml(r.brief?.event||r.id)+'</b><small>'+escapeHtml(r.brief?.taskType||"research_event")+' · '+escapeHtml(r.status)+' · '+new Date(r.createdAt).toLocaleString()+' · '+((r.workers||[]).length)+' departments</small></div><span class="decision '+decisionClass(d)+'">'+escapeHtml(String(d).slice(0,32))+'</span><button class="subtle run-open" data-run-id="'+escapeHtml(r.id)+'">Open report</button></div>'}).join(""):'<div class="empty">No investigations yet. Start the first WIN run above.</div>';
  $("#tipsList").innerHTML=tips.length?tips.slice().reverse().slice(0,8).map(t=>'<div class="mini-row"><div><b>'+escapeHtml(t.tip.slice(0,110))+'</b><small>'+escapeHtml(t.tipster||t.sourceName)+' · '+escapeHtml(t.status)+'</small></div></div>').join(""):'<div class="empty">No human tips imported.</div>';
  $("#ledgerList").innerHTML=preds.length?preds.slice().reverse().slice(0,8).map(p=>'<div class="mini-row"><div><b>'+escapeHtml(p.brief?.event||p.id)+'</b><small>Frozen '+new Date(p.recordedAt).toLocaleString()+'</small></div><span class="decision">'+(p.frozen?"FROZEN":"")+'</span></div>').join(""):'<div class="empty">No frozen predictions yet.</div>';
  if(selectedRunId){
    const current=await api("/api/runs/"+encodeURIComponent(selectedRunId));
    renderRunDetail(current);
  }
  $("#mcpStatus").textContent="OAuth MCP endpoint deployed; plugin authorization test pending";
  await refreshLibrary();
  await refreshSimulations();
  await refreshAIBudget();
 }catch(e){$("#apiStatus").textContent="Authentication needed";$("#runsList").textContent=e.message}
}
$("#refreshBudget").addEventListener("click",refreshAIBudget);
$("#refreshLearning").addEventListener("click",refreshLearning);
$("#runPostMatchCheck").addEventListener("click",async()=>{
 const button=$("#runPostMatchCheck");
 button.disabled=true;
 $("#postMatchUpdated").textContent="Searching public result sources and Google discovery leads…";
 try{
  const data=await api("/api/post-match-check",{method:"POST",body:JSON.stringify({action:"run_post_match_check"})});
  const summary=data.summary||data;
  $("#postMatchUpdated").textContent=data.status==="queued"
   ?"Post-match check queued. Refresh this monitor to see completed results."
   :"Checked "+Number(summary.couponsChecked||0)+" coupons · "+Number(summary.resolved||0)+" outcome-ready · "+Number(summary.queuedForReview||0)+" awaiting review · "+Number(summary.unresolved||0)+" unresolved · "+Number(summary.googleSearchQueriesUsed||0)+" Google searches";
  await refreshLearning();await refreshReviewerQueue();
 }catch(error){
  $("#postMatchUpdated").textContent="Result check failed: "+error.message;
 }finally{button.disabled=false;}
});

$("#ownerUnlockBudget").addEventListener("click",async()=>{
 const confirmation=prompt("OWNER ONLY. To explicitly unlock WIN AI spending, type exactly: I AUTHORIZE WIN SPENDING UNLOCK");
 if(confirmation===null)return;
 const button=$("#ownerUnlockBudget");
 button.disabled=true;
 try{
  const data=await api("/api/ai-budget",{method:"POST",body:JSON.stringify({action:"owner_approve_unlock",confirmation})});
  renderAIBudget(data);
  announceBudgetAlerts(data.alerts||[]);
  alert("Owner authorization accepted. The previous budget cycle was archived and a fresh $3 spending cycle has started. The $2.95 operating stop remains enforced.");
 }catch(error){
  alert("WIN spending remains locked: "+error.message);
  await refreshAIBudget();
 }finally{button.disabled=false;}
});
$("#testOpenAIKey").addEventListener("click",async()=>{
 if(!confirm("WIN will send one authenticated GET request to OpenAI's model-list endpoint. It will not generate a response, consume inference tokens, change the budget ledger or unlock AI spending. Continue?"))return;
 const button=$("#testOpenAIKey");
 const result=$("#apiKeyCheckResult");
 button.disabled=true;
 result.className="budget-alert empty";
 result.textContent="Checking OpenAI API-key authentication…";
 try{
  const data=await api("/api/openai-key-check",{method:"POST",body:JSON.stringify({action:"validate_api_key"})});
  if(data.authentication==="valid"){
   const modelNote=data.configuredModelListed===true
    ?"The configured model is listed as available."
    :data.configuredModelListed===false
     ?"The configured model is not listed for this credential."
     :"No OPENAI_MODEL is configured.";
   result.className="budget-alert "+(data.configuredModelListed===false?"level-warning":"level-info");
   result.textContent="API KEY AUTHENTICATED · "+modelNote+" No inference was performed; WIN spending approval was not changed.";
  }else{
   result.className="budget-alert "+(data.result==="inconclusive"||data.result==="timeout"||data.result==="network_error"?"level-warning":"level-critical");
   result.textContent="API KEY CHECK "+String(data.result||"failed").toUpperCase().replaceAll("_"," ")+" · "+(data.message||"No additional diagnostic detail.")+" No inference was performed.";
  }
 }catch(error){
  result.className="budget-alert level-warning";
  result.textContent="API KEY CHECK UNAVAILABLE · "+error.message;
 }finally{
  button.disabled=false;
 }
});
$("#testModelResponse").addEventListener("click",async()=>{
 if(!confirm("This will make exactly one billable OpenAI Responses API request using the configured model. The prompt asks for WIN_OK and caps generated output at 16 tokens. WIN will record usage in its budget ledger. No other agents, schedules or AI workers will be enabled. Continue?"))return;
 const button=$("#testModelResponse");
 const result=$("#modelResponseTestResult");
 button.disabled=true;
 result.className="budget-alert empty";
 result.textContent="Sending one minimal model-response request…";
 try{
  const data=await api("/api/openai-key-check",{method:"POST",body:JSON.stringify({action:"validate_model_response"})});
  if(data.result==="response_received"){
   result.className="budget-alert level-info";
   result.textContent="MODEL RESPONSE RECEIVED · "+data.model+" · Output: "+(data.responseText||"(empty)")+" · WIN usage estimate: $"+Number(data.chargedUsd||0).toFixed(6)+" · Input/output tokens: "+(data.usage?data.usage.input_tokens+"/"+data.usage.output_tokens:"usage unavailable")+". Only one diagnostic call ran; normal WIN AI remains disabled.";
  }else{
   result.className="budget-alert "+(data.result==="blocked_by_budget"?"level-warning":"level-critical");
   result.textContent="MODEL TEST "+String(data.result||"failed").toUpperCase().replaceAll("_"," ")+" · "+(data.message||"No additional diagnostic detail.")+(data.chargedUsd!==undefined?" · WIN ledger charge: $"+Number(data.chargedUsd).toFixed(6):"");
  }
  await refreshAIBudget();
 }catch(error){
  result.className="budget-alert level-warning";
  result.textContent="MODEL TEST UNAVAILABLE · "+error.message;
 }finally{
  button.disabled=false;
 }
});
async function refreshDepartmentSmokeTests(){
 try{
  const data=await api("/api/department-smoke-test");
  const tests=data.tests||[];
  $("#departmentSmokeTestHistory").innerHTML=tests.length?tests.slice(0,10).map(t=>'<article class="budget-alert-row"><span class="decision '+(t.result==="passed"?"bet":"wait")+'">'+escapeHtml(String(t.result||"unknown").replaceAll("_"," "))+'</span><div><b>'+escapeHtml(t.departmentId+" · "+t.departmentName)+'</b><small>'+new Date(t.createdAt).toLocaleString()+' · '+(t.chargedUsd===null?"charge uncertain":"$"+Number(t.chargedUsd||0).toFixed(6))+(t.providerStatus?" · HTTP "+t.providerStatus:"")+(t.providerErrorCode?" · "+escapeHtml(t.providerErrorCode):"")+(t.providerRequestId?" · request "+escapeHtml(t.providerRequestId):"")+(t.providerErrorMessage?" · "+escapeHtml(t.providerErrorMessage):"")+(t.providerResponseExcerpt?" · "+escapeHtml(t.providerResponseExcerpt):"")+'</small></div></article>').join(""):'<div class="empty">No department smoke-test history.</div>';
 }catch(error){
  $("#departmentSmokeTestHistory").textContent="Could not load smoke-test history: "+error.message;
 }
}
$("#runDepartmentSmokeTest").addEventListener("click",async()=>{
 const departmentId=$("#departmentSmokeSelect").value;
 if(!confirm("Run one isolated "+departmentId+" department-routing smoke test? It makes one billable Responses API request with no web tools and at most 120 output tokens. It does not perform sports research, create an investigation, enable normal AI workers or change WIN_AI_BUDGET_APPROVED. Existing budget lock and $2.95 stop still apply."))return;
 const button=$("#runDepartmentSmokeTest");
 const result=$("#departmentSmokeTestResult");
 button.disabled=true;
 result.className="budget-alert empty";
 result.textContent="Testing "+departmentId+" department routing…";
 try{
  const data=await api("/api/department-smoke-test",{method:"POST",body:JSON.stringify({action:"smoke_test",departmentId})});
  if(data.result==="passed"){
   result.className="budget-alert level-info";
   result.textContent="DEPARTMENT ROUTING PASSED · "+data.departmentId+" "+data.departmentName+" · "+(data.usage?"Tokens "+data.usage.input_tokens+"/"+data.usage.output_tokens:"Usage unavailable")+" · ledger charge $"+Number(data.chargedUsd||0).toFixed(6)+". No sports research or normal worker execution occurred.";
  }else{
   result.className="budget-alert "+(data.result==="blocked_by_budget"?"level-warning":"level-critical");
   result.textContent="DEPARTMENT TEST "+String(data.result||"failed").toUpperCase().replaceAll("_"," ")+" · "+(data.message||"No additional detail.")+(data.providerStatus!==undefined?" · HTTP "+data.providerStatus:"")+(data.providerErrorCode?" · OpenAI code: "+data.providerErrorCode:"")+(data.providerErrorType?" · type: "+data.providerErrorType:"")+(data.providerErrorMessage?" · detail: "+data.providerErrorMessage:"")+(data.providerResponseExcerpt?" · response: "+data.providerResponseExcerpt:"")+(data.providerContentType?" · content type: "+data.providerContentType:"")+(data.providerRequestId?" · request ID: "+data.providerRequestId:"")+(data.chargedUsd!==undefined&&data.chargedUsd!==null?" · ledger charge $"+Number(data.chargedUsd).toFixed(6):"");
  }
  await Promise.all([refreshAIBudget(),refreshDepartmentSmokeTests()]);
 }catch(error){
  result.className="budget-alert level-warning";
  result.textContent="DEPARTMENT TEST UNAVAILABLE · "+error.message;
 }finally{
  button.disabled=false;
 }
});
$("#budgetNotifications").addEventListener("click",async()=>{
 if(!("Notification" in window)){alert("This browser does not support desktop notifications.");return;}
 const permission=await Notification.requestPermission();
 updateBudgetNotificationButton();
 if(permission==="granted")alert("WIN desktop budget alerts are enabled. Keep the dashboard open to receive limit notifications.");
 else alert("Desktop notifications were not enabled. You will still see budget alarms inside the WIN dashboard.");
});
$("#saveToken").addEventListener("click",e=>{e.preventDefault();token=$("#tokenInput").value.trim();if(token){sessionStorage.setItem("win-token",token);dialog.close();refresh();refreshSources();refreshResearch()}});
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
$("#refreshCoverage").addEventListener("click",refreshCoverage);
$("#refreshResearch").addEventListener("click",refreshResearch);

$("#createReviewerAccess").addEventListener("click",async()=>{
 const button=$("#createReviewerAccess");button.disabled=true;
 try{
  const data=await api("/api/independent-review",{method:"POST",body:JSON.stringify({action:"create_reviewer_access"})});
  $("#reviewerCredentialOutput").value=data.token;
  $("#reviewerCredentialStatus").textContent="Credential "+data.credentialId+" created and shown once. Copy it and share it only with a different trusted reviewer. Creating another credential revokes this one.";
  try{await navigator.clipboard.writeText(data.token);$("#reviewerCredentialStatus").textContent+=" Copied to clipboard.";}catch{}
 }catch(error){$("#reviewerCredentialStatus").textContent="Could not create reviewer credential: "+error.message;}
 finally{button.disabled=false;}
});
$("#connectReviewer").addEventListener("click",async()=>{
 reviewerToken=$("#reviewerTokenInput").value.trim();
 if(!reviewerToken){$("#reviewerQueueStatus").textContent="Paste the separate reviewer credential first.";return;}
 sessionStorage.setItem("win-reviewer-token",reviewerToken);
 await refreshReviewerQueue();
});
$("#forgetReviewer").addEventListener("click",()=>{
 reviewerToken="";sessionStorage.removeItem("win-reviewer-token");$("#reviewerTokenInput").value="";
 $("#reviewerQueueStatus").textContent="Reviewer credential forgotten in this browser session.";
 $("#reviewerQueue").innerHTML="";
});
$("#reviewerQueue").addEventListener("click",async e=>{
 const button=e.target.closest("[data-review-decision]");
 if(!button)return;
 const card=button.closest("[data-case-id]");
 const caseType=card.dataset.caseType,caseId=card.dataset.caseId,decision=button.dataset.reviewDecision;
 const reviewerName=card.querySelector("[data-reviewer-name]").value.trim();
 const reviewerNotes=card.querySelector("[data-reviewer-notes]").value.trim();
 const evidenceUrls=card.querySelector("[data-reviewer-evidence]").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const checks={};card.querySelectorAll("[data-check]").forEach(input=>checks[input.dataset.check]=input.checked);
 const manualLegResults=[];
 if(caseType==="win_coupon"&&decision==="approve"){
  let missingResolution=false,missingManualEvidence=false;
  card.querySelectorAll("[data-leg-result]").forEach(select=>{
   const value=select.value,index=Number(select.dataset.legIndex);
   if(!value){missingResolution=true;return;}
   if(value==="keep")return;
   const evidenceUrl=card.querySelector('[data-leg-evidence][data-leg-index="'+index+'"]').value.trim();
   if(!evidenceUrl){missingManualEvidence=true;return;}
   manualLegResults.push({index,status:value,evidenceUrl});
  });
  if(missingResolution){alert("Choose a result for every unresolved leg. Keep automatic results only when they are supported by the structured source.");return;}
  if(missingManualEvidence){alert("Every manually changed or resolved leg needs its own independent HTTPS source URL.");return;}
 }
 if(reviewerName.length<2||reviewerNotes.length<40){alert("Enter your name and at least 40 characters of review notes.");return;}
 if(decision==="approve"&&(!evidenceUrls.length||Object.values(checks).some(value=>value!==true))){alert("Approval requires new corroborating evidence and every applicable review check.");return;}
 button.disabled=true;
 try{
  const result=await reviewerApi("/api/independent-review",{method:"POST",body:JSON.stringify({
   action:"review_case",caseType,caseId,decision,reviewerName,reviewerNotes,evidenceUrls,checks,manualLegResults
  })});
  $("#reviewerQueueStatus").textContent=decision.toUpperCase()+" saved for "+caseId+". Outcome applied: "+(result.outcomeApplied?"yes":"no")+".";
  await refreshReviewerQueue();await refreshLibrary();await refreshSettlementQueue();await refreshLearning();
 }catch(error){alert(error.message);button.disabled=false;}
});
$("#settlementEvidenceForm").addEventListener("submit",async e=>{
 e.preventDefault();const form=e.currentTarget,f=new FormData(form),button=form.querySelector('button[type="submit"]');
 if(button){button.disabled=true;button.textContent="Submitting…";}
 try{
  const result=await api("/api/human-coupon-settlements",{method:"POST",body:JSON.stringify({couponId:f.get("couponId"),claimedOutcome:f.get("claimedOutcome"),evidenceUrl:f.get("evidenceUrl"),evidenceSummary:f.get("evidenceSummary")})});
  $("#settlementStatus").textContent="Submitted "+result.record.id+" · pending independent review. Coupon outcome unchanged.";
  form.reset();await refreshSettlementQueue();
 }catch(err){$("#settlementStatus").textContent="Submission failed: "+err.message;alert(err.message);}
 finally{if(button){button.disabled=false;button.textContent="Submit settlement evidence ↗";}}
});

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

async function refreshSources(){
 try{
  const [registry,report]=await Promise.all([api("/api/sources"),api("/api/sources?view=report")]);
  const statuses=(registry.sources||[]).map(s=>'<article class="mini-row"><div><b>'+escapeHtml(s.name)+'</b><small>'+escapeHtml(s.status)+' · automated collection '+(s.automatedCollection?"enabled":"disabled")+'</small><p>'+escapeHtml(s.note)+'</p><a href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer">Open source ↗</a></div></article>').join("");
  $("#sourceRegistry").innerHTML=statuses||'<div class="empty">No source records configured.</div>';
  $("#sourceImportStatus").textContent=Number(report.total||0)+" imports stored · "+Number(report.pending||0)+" awaiting settlement. Automated collectors: disabled.";
 }catch(e){$("#sourceImportStatus").textContent="Source registry unavailable: "+e.message}
}
$("#sourceImportForm").addEventListener("submit",async e=>{
 e.preventDefault();const form=e.currentTarget,f=new FormData(form),button=form.querySelector('button[type="submit"]');
 let selections=[];const raw=String(f.get("selections")||"").trim();
 if(raw){try{selections=JSON.parse(raw);if(!Array.isArray(selections))throw new Error("Selections JSON must be an array.");}catch(err){alert("Invalid selections JSON: "+err.message);return;}}
 if(button){button.disabled=true;button.textContent="Importing…";}
 try{
  const result=await api("/api/sources",{method:"POST",body:JSON.stringify({
   action:"import_coupon",sourceId:f.get("sourceId"),tipsterName:f.get("tipsterName"),
   sourceUrl:f.get("sourceUrl"),publishedAt:f.get("publishedAt"),competition:f.get("competition"),
   couponText:f.get("couponText"),selections,sourceSnapshot:f.get("sourceSnapshot"),
   authorizedToStore:f.get("authorizedToStore")==="on",importMethod:"manual_user_submission"
  })});
  $("#sourceImportStatus").textContent=(result.duplicate?"Duplicate already recorded: ":"Imported: ")+result.id+" · settlement pending.";
  form.reset();await refreshSources();await refreshLibrary();
 }catch(err){$("#sourceImportStatus").textContent="Import failed: "+err.message;alert(err.message);}
 finally{if(button){button.disabled=false;button.textContent="Import coupon into WIN ↗";}}
});
$("#refreshSources").addEventListener("click",refreshSources);

$("#libraryCategory").addEventListener("change",refreshLibrary);
$("#libraryQuery").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();refreshLibrary()}});
$("#libraryList").addEventListener("click",async e=>{
 const button=e.target.closest("[data-settle-id]");
 if(!button)return;
 const settlementSource=prompt("Enter an HTTPS URL for an official result or settlement source. Human-origin coupons must use the separate independent review queue:");
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

if(!token)dialog.showModal();else {refresh();refreshSources();refreshCoverage();refreshResearch();refreshCouponBoards();refreshLearning();if(reviewerToken){$("#reviewerTokenInput").value=reviewerToken;refreshReviewerQueue();}}
setInterval(()=>{if(token&&!document.hidden)refresh()},20000);
setInterval(()=>{if(token&&!document.hidden)refreshLearning()},60000);

$("#simulationForm").addEventListener("submit",async e=>{
 e.preventDefault();const form=e.currentTarget,f=new FormData(form),button=form.querySelector('button[type="submit"]');
 let selections;try{const parsed=JSON.parse(String(f.get("selections")||""));selections=Array.isArray(parsed)?parsed:parsed.selections;if(!Array.isArray(selections))throw new Error("JSON must be an array or an object with a selections array.");}catch(err){alert("Invalid historical dataset JSON: "+err.message);return;}
 if(button){button.disabled=true;button.textContent="Queuing simulation…";}
 $("#simulationStatus").textContent="Validating historical selections and queuing the background simulation…";
 try{
  const result=await api("/api/simulations",{method:"POST",body:JSON.stringify({selections,couponCount:Number(f.get("couponCount")),minLegs:Number(f.get("minLegs")),maxLegs:Number(f.get("maxLegs")),seed:f.get("seed")||undefined})});
  $("#simulationStatus").textContent="Queued simulation "+result.runId+" · "+Number(result.couponCount).toLocaleString()+" coupons · "+result.selectionCount+" historical selections. Refresh to see progress and results.";
  $("#simulationRunId").value=result.runId;$("#simulationCategory").value="runs";await refreshSimulations();
 }catch(err){$("#simulationStatus").textContent="Simulation not started: "+err.message;alert(err.message);}
 finally{if(button){button.disabled=false;button.textContent="Run historical experiment ↗";}}
});
$("#refreshSimulations").addEventListener("click",refreshSimulations);
$("#simulationCategory").addEventListener("change",refreshSimulations);
$("#simulationRunId").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();refreshSimulations();}});
$("#simulationList").addEventListener("click",e=>{
 const b=e.target.closest("[data-sim-run]");if(!b)return;
 $("#simulationRunId").value=b.dataset.simRun;$("#simulationCategory").value="winning";refreshSimulations();
});
