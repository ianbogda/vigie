import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";

const API_KEY=String(process.env.EPLE_TOOLS_API_KEY||"");
function authorized(req:FastifyRequest){
 const raw=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");if(!API_KEY||!raw)return false;
 const a=Buffer.from(createHash("sha256").update(raw).digest()),b=Buffer.from(createHash("sha256").update(API_KEY).digest());
 return a.length===b.length&&timingSafeEqual(a,b);
}
const uaiOf=(...v:unknown[])=>{for(const x of v){const m=String(x??"").toUpperCase().match(/\b0?([0-9]{7}[A-Z])\b/);if(m)return m[0]}return null};
const processCode=(domain:string,code:string)=>code.startsWith("ACH-")?"DEPENSE_FACTURE":code.startsWith("BUD-")?"BUDGET":code.startsWith("FDR-")?"BUDGET":domain.includes("Comptabilité")?"TRESORERIE":null;
const level=(x:string)=>x==="alert"?{type:"ALERT",severity:3}:x==="watch"?{type:"WARNING",severity:2}:{type:"INFO",severity:1};

export function registerEpleTools(app:FastifyInstance,pool:Pool,version:string){
 app.get("/api/eple-tools/v1/health",async(req,reply)=>authorized(req)?{ok:true,contract:"eple-tools/v1",service:"vigie",version}:reply.code(401).send({error:"UNAUTHORIZED"}));
 app.get("/api/eple-tools/v1/signals",async(req:any,reply)=>{
  if(!authorized(req))return reply.code(401).send({error:"UNAUTHORIZED"});
  const uai=String(req.query?.uai||"").toUpperCase();if(!uai)return reply.code(400).send({error:"UAI_REQUIRED"});
  const dashboard:any=await app.inject({method:"GET",url:"/api/dashboard"});const body=dashboard.json();
  const e=(body.establishments||[]).find((x:any)=>x.uai===uai);if(!e)return{contract:"eple-tools/v1",uai,signals:[]};
  const observedAt=e.freshness?new Date(`${e.freshness}T12:00:00Z`).toISOString():new Date().toISOString();
  const signals=(e.signals||[]).map((s:any,i:number)=>{const l=level(s.level);return{id:`vigie:${uai}:${s.code}:${e.freshness||"current"}:${s.account||i}`,source:"VIGIE",uai,domain:s.domain||"Autre",processCode:processCode(s.domain||"",s.code||""),type:l.type,severity:l.severity,title:s.title,description:s.detail||null,observedAt,evidence:s.evidence||[],rule:{code:s.code,condition:s.condition||null,interpretation:s.interpretation||null,source:s.source||null}}});
  return{contract:"eple-tools/v1",uai,generatedAt:new Date().toISOString(),signals};
 });
}
