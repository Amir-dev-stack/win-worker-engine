import type { Context } from "@netlify/functions";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { authorized } from "../lib/auth.mts";
import { get, list } from "../lib/store.mts";

function buildServer(baseUrl:string, token:string){
 const server=new McpServer({name:"WIN Worker Engine",version:"0.1.0"});
 server.tool("start_research_run","Start a new independent WIN research and debate run. No bet is placed.",{
  event:z.string().min(3),sport:z.string().optional(),competition:z.string().optional(),country:z.string().optional(),
  dateTime:z.string().optional(),markets:z.array(z.string()).optional(),humanTips:z.array(z.any()).optional(),context:z.string().optional()
 },async(args)=>{
  const response=await fetch(baseUrl+"/api/runs",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token},body:JSON.stringify({event:args.event,...args})});
  return{content:[{type:"text",text:await response.text()}],isError:!response.ok&&response.status!==202};
 });
 server.tool("get_run","Read a WIN run by its ID",{runId:z.string()},async({runId})=>{
  const run=await get<any>("runs",runId);
  return{content:[{type:"text",text:JSON.stringify(run??{error:"Run not found"})}]};
 });
 server.tool("list_runs","List recent WIN research runs",{},async()=>{
  return{content:[{type:"text",text:JSON.stringify(await list("runs",50))}]};
 });
 server.tool("list_human_tips","List user-imported public or authorized human tips",{},async()=>{
  return{content:[{type:"text",text:JSON.stringify(await list("tips",100))}]};
 });
 server.tool("list_predictions","Read the frozen WIN prediction ledger",{},async()=>{
  return{content:[{type:"text",text:JSON.stringify(await list("predictions",200))}]};
 });
 return server;
}
export default async(req:Request,context:Context)=>{
 if(!authorized(req))return new Response("Unauthorized",{status:401});
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const token=Netlify.env.get("WIN_INTERNAL_TOKEN");
 if(!token)return new Response("WIN_INTERNAL_TOKEN is not configured",{status:503});
 const server=buildServer(context.site.url,token);
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 await server.connect(transport);
 return transport.handleRequest(req);
};
export const config={path:"/mcp",rateLimit:{windowSize:60,windowLimit:40,aggregateBy:["ip"]}};
