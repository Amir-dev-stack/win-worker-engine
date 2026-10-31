const $=s=>document.querySelector(s);
let token=sessionStorage.getItem("win-token")||"";
const dialog=$("#tokenDialog");
function headers(){return {"content-type":"application/json","authorization":"Bearer "+token}}
async function api(path,options={}){const r=await fetch(path,{...options,headers:{...headers(),...(options.headers||{})}});if(r.status===401){dialog.showModal();throw new Error("Enter your WIN internal token to connect.");}const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Request failed ("+r.status+")");return data}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function decisionClass(text=""){const t=text.toUpperCase();return t.includes("NO BET")?"no":t.includes("BET")?"bet":"wait"}
async function refresh(){
 try{
  const health=await fetch("/api/health").then(r=>r.json());$("#apiStatus").textContent=health.status==="online"?"API online":"API unavailable";
  const [runs,tips,preds]=await Promise.all([api("/api/runs"),api("/api/tips"),api("/api/predictions")]);
  $("#runCount").textContent=runs.length;$("#tipCount").textContent=tips.length;$("#predictionCount").textContent=preds.length;
  $("#workerCount").textContent=runs.reduce((n,r)=>n+(r.workers||[]).filter(w=>w.status==="completed").length+(r.debate||[]).filter(w=>w.status==="completed").length,0);
  $("#runsList").innerHTML=runs.length?runs.slice().reverse().map(r=>{const d=r.decision||r.master?.report||r.status;return '<div class="run-row"><div><b>'+escapeHtml(r.brief?.event||r.id)+'</b><small>'+escapeHtml(r.status)+' · '+new Date(r.createdAt).toLocaleString()+' · '+((r.workers||[]).length)+' specialists</small></div><span class="decision '+decisionClass(d)+'">'+escapeHtml(String(d).slice(0,32))+'</span></div>'}).join(""):'<div class="empty">No investigations yet. Start the first research run above.</div>';
  $("#tipsList").innerHTML=tips.length?tips.slice().reverse().slice(0,8).map(t=>'<div class="mini-row"><div><b>'+escapeHtml(t.tip.slice(0,110))+'</b><small>'+escapeHtml(t.tipster||t.sourceName)+' · '+escapeHtml(t.status)+'</small></div></div>').join(""):'<div class="empty">No human tips imported.</div>';
  $("#ledgerList").innerHTML=preds.length?preds.slice().reverse().slice(0,8).map(p=>'<div class="mini-row"><div><b>'+escapeHtml(p.brief?.event||p.id)+'</b><small>Frozen '+new Date(p.recordedAt).toLocaleString()+'</small></div><span class="decision">'+(p.frozen?"FROZEN":"")+'</span></div>').join(""):'<div class="empty">No frozen predictions yet.</div>';
 }catch(e){$("#apiStatus").textContent="Authentication needed";$("#runsList").textContent=e.message}
}
$("#saveToken").addEventListener("click",e=>{e.preventDefault();token=$("#tokenInput").value.trim();if(token){sessionStorage.setItem("win-token",token);dialog.close();refresh()}});
$("#runForm").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;const b=e.submitter||form.querySelector('[type="submit"]');if(b){b.disabled=true;b.textContent="Queuing…"}const f=new FormData(form);try{const data=await api("/api/runs",{method:"POST",body:JSON.stringify({event:f.get("event"),sport:f.get("sport"),competition:f.get("competition"),dateTime:f.get("dateTime"),markets:String(f.get("markets")||"").split(",").map(s=>s.trim()).filter(Boolean),context:f.get("context")})});form.reset();alert("Research run queued: "+data.runId);await refresh()}catch(err){alert(err.message)}finally{if(b){b.disabled=false;b.innerHTML='Launch research <b>↗</b>'}}});
$("#tipForm").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);try{await api("/api/tips",{method:"POST",body:JSON.stringify({tip:f.get("tip"),sourceUrl:f.get("sourceUrl"),tipster:f.get("tipster")})});form.reset();await refresh()}catch(err){alert(err.message)}});
$("#refresh").addEventListener("click",refresh);
if(!token)dialog.showModal();else refresh();
setInterval(()=>{if(token)refresh()},20000);
