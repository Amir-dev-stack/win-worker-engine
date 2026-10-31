const $=s=>document.querySelector(s);
let token=sessionStorage.getItem("win-token")||"";
const dialog=$("#tokenDialog");
function headers(){return {"content-type":"application/json","authorization":"Bearer "+token}}
async function api(path,options={}){const r=await fetch(path,{...options,headers:{...headers(),...(options.headers||{})}});if(r.status===401){if(!dialog.open)dialog.showModal();throw new Error("Connect using your WIN internal token.");}const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Request failed ("+r.status+")");return data}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function decisionClass(text=""){const t=String(text).toUpperCase();return t.includes("NO BET")?"no":t.includes("BET")?"bet":"wait"}
function safeUrl(value){try{const u=new URL(value);return ["https:","http:"].includes(u.protocol)?u.href:""}catch{return ""}}
function citationHtml(items=[]){return items.map(c=>{const u=safeUrl(c.url);return u?'<a href="'+escapeHtml(u)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(c.title||u)+'</a>':""}).filter(Boolean).join("")}
function reportCard(item){
 const title=escapeHtml(item.role||"Research report");
 const state=escapeHtml(item.status||"unknown");
 const error=item.error?'<p class="report-error">'+escapeHtml(item.error)+'</p>':"";
 const report=item.report?'<pre>'+escapeHtml(item.report)+'</pre>':"";
 const citations=citationHtml(item.citations||[]);
 return '<article class="report-card"><div class="report-title"><b>'+title+'</b><span class="decision '+(state==="completed"?"bet":state==="failed"?"no":"wait")+'">'+state+'</span></div>'+error+report+(citations?'<div class="citations"><b>Sources:</b> '+citations+'</div>':"")+'</article>';
}
function renderRunDetail(run){
 const node=$("#runDetail");
 const workers=run.workers||[];
 const debate=run.debate||[];
 const all=[...workers,...debate];
 const master=run.master?reportCard(run.master):'<div class="empty">Global Master report not available yet.</div>';
 const title=escapeHtml(run.brief?.event||run.id);
 const brief='<div class="detail-meta">'+escapeHtml(run.status||"unknown")+' · Started '+escapeHtml(new Date(run.createdAt).toLocaleString())+'</div>';
 const cards=all.length?all.map(reportCard).join(""):'<div class="empty">Worker reports have not arrived yet.</div>';
 node.innerHTML='<div class="detail-head"><div><div class="eyebrow">SELECTED INVESTIGATION</div><h3>'+title+'</h3>'+brief+'</div><button class="subtle" id="closeRunDetail">Close</button></div><h4>Specialist reports ('+workers.length+')</h4>'+cards+'<h4>Adversarial review ('+debate.length+')</h4>'+(debate.length?debate.map(reportCard).join(""):'<div class="empty">Debate reports have not arrived yet.</div>')+'<h4>Global Master decision</h4>'+master+(run.error?'<p class="report-error">'+escapeHtml(run.error)+'</p>':"");
 node.classList.remove("hidden");
 $("#closeRunDetail").addEventListener("click",()=>node.classList.add("hidden"));
}
async function openRun(id){
 const node=$("#runDetail");
 node.classList.remove("hidden");
 node.textContent="Loading the complete research report…";
 try{renderRunDetail(await api("/api/runs/"+encodeURIComponent(id)))}
 catch(e){node.textContent=e.message}
}
async function refresh(){
 try{
  const health=await fetch("/api/health").then(r=>r.json());
  $("#apiStatus").textContent=health.status==="online"?"API online":"API unavailable";
  const [runs,tips,preds]=await Promise.all([api("/api/runs"),api("/api/tips"),api("/api/predictions")]);
  $("#runCount").textContent=runs.length;$("#tipCount").textContent=tips.length;$("#predictionCount").textContent=preds.length;
  $("#workerCount").textContent=runs.reduce((n,r)=>n+(r.workers||[]).filter(w=>w.status==="completed").length+(r.debate||[]).filter(w=>w.status==="completed").length,0);
  $("#runsList").innerHTML=runs.length?runs.slice().reverse().map(r=>{const d=r.decision||r.master?.report||r.status;return '<div class="run-row"><div><b>'+escapeHtml(r.brief?.event||r.id)+'</b><small>'+escapeHtml(r.status)+' · '+new Date(r.createdAt).toLocaleString()+' · '+((r.workers||[]).length)+' specialists</small></div><span class="decision '+decisionClass(d)+'">'+escapeHtml(String(d).slice(0,32))+'</span><button class="subtle run-open" data-run-id="'+escapeHtml(r.id)+'">Open report</button></div>'}).join(""):'<div class="empty">No investigations yet. Start the first research run above.</div>';
  $("#tipsList").innerHTML=tips.length?tips.slice().reverse().slice(0,8).map(t=>'<div class="mini-row"><div><b>'+escapeHtml(t.tip.slice(0,110))+'</b><small>'+escapeHtml(t.tipster||t.sourceName)+' · '+escapeHtml(t.status)+'</small></div></div>').join(""):'<div class="empty">No human tips imported.</div>';
  $("#ledgerList").innerHTML=preds.length?preds.slice().reverse().slice(0,8).map(p=>'<div class="mini-row"><div><b>'+escapeHtml(p.brief?.event||p.id)+'</b><small>Frozen '+new Date(p.recordedAt).toLocaleString()+'</small></div><span class="decision">'+(p.frozen?"FROZEN":"")+'</span></div>').join(""):'<div class="empty">No frozen predictions yet.</div>';
  $("#mcpStatus").textContent="OAuth endpoint deployed; ChatGPT plugin linking still needs final verification";
 }catch(e){$("#apiStatus").textContent="Authentication needed";$("#runsList").textContent=e.message}
}
$("#saveToken").addEventListener("click",e=>{e.preventDefault();token=$("#tokenInput").value.trim();if(token){sessionStorage.setItem("win-token",token);dialog.close();refresh()}});
$("#runForm").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;const b=e.submitter||form.querySelector('[type="submit"]');if(b){b.disabled=true;b.textContent="Queuing…"}const f=new FormData(form);try{const data=await api("/api/runs",{method:"POST",body:JSON.stringify({event:f.get("event"),sport:f.get("sport"),competition:f.get("competition"),dateTime:f.get("dateTime"),markets:String(f.get("markets")||"").split(",").map(s=>s.trim()).filter(Boolean),context:f.get("context")})});form.reset();alert("Research run queued: "+data.runId);await refresh();await openRun(data.runId)}catch(err){alert(err.message)}finally{if(b){b.disabled=false;b.innerHTML='Launch research <b>↗</b>'}}});
$("#tipForm").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);try{await api("/api/tips",{method:"POST",body:JSON.stringify({tip:f.get("tip"),sourceUrl:f.get("sourceUrl"),tipster:f.get("tipster")})});form.reset();await refresh()}catch(err){alert(err.message)}});
$("#runsList").addEventListener("click",e=>{const b=e.target.closest("[data-run-id]");if(b)openRun(b.dataset.runId)});
$("#refresh").addEventListener("click",refresh);
if(!token)dialog.showModal();else refresh();
setInterval(()=>{if(token&&!document.hidden)refresh()},20000);
