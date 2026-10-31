export type Citation = { title?: string; url?: string; snippet?: string };
export type WorkerReport = {
  workerId: string; role: string; phase: string; status: "completed" | "failed";
  responseId?: string; report: string; citations: Citation[]; error?: string;
  startedAt: string; completedAt: string;
};

const specialists = [
  ["form", "Recent form and performance analyst"],
  ["availability", "Lineups, injuries and player availability analyst"],
  ["tactics", "Tactical matchup and style analyst"],
  ["statistics", "Sport-specific statistical analyst"],
  ["context", "Competition, motivation, schedule and context analyst"],
  ["market", "Betting market and settlement rules analyst"],
  ["tipster", "Human tipster and Strefa Inspiracji evidence analyst"],
  ["against", "Independent skeptical FOR/AGAINST red-team analyst"]
] as const;

function extractText(data: any): string {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks: string[] = [];
  for (const item of data.output ?? []) for (const part of item.content ?? []) {
    if (part.type === "output_text" && part.text) chunks.push(part.text);
  }
  return chunks.join("\n");
}
function extractCitations(data: any): Citation[] {
  const found: Citation[] = [];
  for (const item of data.output ?? []) for (const part of item.content ?? []) {
    for (const a of part.annotations ?? []) if (a.type === "url_citation" && a.url) found.push({title:a.title,url:a.url,snippet:a.snippet});
  }
  for (const item of data.output ?? []) {
    if (item.type === "web_search_call") {
      for (const source of item.action?.sources ?? item.results ?? []) {
        if (source.url || source.source_website_url) found.push({title:source.title,url:source.url||source.source_website_url,snippet:source.snippet});
      }
    }
  }
  return [...new Map(found.filter(x=>x.url).map(x=>[x.url,x])).values()];
}
export async function askWorker(role: string, phase: string, brief: unknown, peerReports?: WorkerReport[]): Promise<WorkerReport> {
  const startedAt = new Date().toISOString();
  const workerId = crypto.randomUUID();
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  const model = Netlify.env.get("OPENAI_MODEL");
  if (!apiKey || !model) return {workerId,role,phase,status:"failed",report:"",citations:[],error:!apiKey?"OPENAI_API_KEY is not configured.":"OPENAI_MODEL is not configured. Set a model ID available to your API account.",startedAt,completedAt:new Date().toISOString()};
  const webSearch = (Netlify.env.get("WIN_ENABLE_WEB_SEARCH") ?? "true") === "true";
  const instructions = [
    "You are an independent research worker in WIN, a cautious sports betting research system.",
    "Do not invent facts, injuries, odds, lineups, sources or statistics. State what is unknown.",
    "Research current, primary and reputable sources using web search. Cite source URLs and publication or update times where available. Distinguish verified facts, reported claims, inference and uncertainty.",
    "Do not treat tipster win rates, follower counts or copied coupons as proof of skill. Require sample size and time window.",
    "Do not recommend a bet solely to reach a target combined price. Account for correlation and market settlement.",
    "Return a structured report with: findings, evidence and timestamps, FOR case, AGAINST case, unknowns, confidence (low/medium/high), and provisional verdict (BET/WAIT/NO BET)."
  ].join("\n");
  const input = phase === "initial"
    ? "Research brief (independent; do not assume other workers' conclusions):\n" + JSON.stringify(brief)
    : "Review the original brief and peer reports. Challenge unsupported assumptions; correct errors; identify disagreement and missing evidence. Do not merely agree. Re-check disputed/current claims with web search.\nBRIEF:\n" + JSON.stringify(brief) + "\nPEER REPORTS:\n" + JSON.stringify(peerReports ?? []);
  try {
    const body: any = {model,instructions,input,store:false};
    if (webSearch) {
      body.tools = [{type:"web_search"}];
      body.tool_choice = "required";
      body.include = ["web_search_call.action.sources"];
    }
    const response = await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data: any = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Responses API returned HTTP "+response.status);
    return {workerId,role,phase,status:"completed",responseId:data.id,report:extractText(data),citations:extractCitations(data),startedAt,completedAt:new Date().toISOString()};
  } catch (error) {
    return {workerId,role,phase,status:"failed",report:"",citations:[],error:String(error),startedAt,completedAt:new Date().toISOString()};
  }
}
export async function runIndependentWorkers(brief: unknown) {
  return Promise.all(specialists.map(([role,label])=>askWorker(label,"initial",brief)));
}
export async function runDebate(brief: unknown, reports: WorkerReport[]) {
  const roles = ["FOR-side challenger","AGAINST-side challenger","Markets and settlement auditor","Quantitative evidence reviewer"];
  return Promise.all(roles.map(role=>askWorker(role,"debate",brief,reports)));
}
export async function runGlobalMaster(brief: unknown, reports: WorkerReport[], debate: WorkerReport[]) {
  return askWorker("Global Master — final decision authority","final",{
    brief,initialReports:reports,debateReports:debate,
    mandatoryRules:["Return exactly one final decision: BET, WAIT or NO BET.","Choose NO BET when core evidence is missing, contradictory, stale or unverifiable.","Never manufacture a combined-odds target by adding weak selections.","Explain market settlement, correlation, key risks and unverified claims.","No bet placement."]
  });
}
