import http from "node:http";

const PORT = Number(process.env.PORT || 3211);
const DS_ENDPOINT = process.env.DS_ENDPOINT || "https://www.demarches-simplifiees.fr/api/v2/graphql";
const DS_API_TOKEN = process.env.DS_API_TOKEN;

if (!DS_API_TOKEN) {
  console.error("DS_API_TOKEN absent.");
  process.exit(1);
}

async function gql(query, variables = {}) {
  const r = await fetch(DS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DS_API_TOKEN}`
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await r.json();
  if (!r.ok || json.errors?.length) {
    throw new Error(json.errors?.map(e => e.message).join(" · ") || `HTTP ${r.status}`);
  }
  return json.data;
}

const PROCEDURE = `query Procedure($number: Int!) {
  demarche(number: $number) {
    id number title
    activeRevision { id champDescriptors { id label type } }
  }
}`;

const DOSSIERS = `query Dossiers($number: Int!, $after: String) {
  demarche(number: $number) {
    dossiers(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id number dateDerniereModification state
        champs { id label ... on TextChamp { stringValue } }
      }
    }
  }
}`;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.APP_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
}
function send(res, status, data) {
  cors(res); res.writeHead(status, {"Content-Type":"application/json; charset=utf-8"});
  res.end(JSON.stringify(data));
}
async function body(req) {
  let s=""; for await (const c of req) s+=c;
  return s ? JSON.parse(s) : {};
}

http.createServer(async (req,res)=>{
  cors(res);
  if(req.method==="OPTIONS"){res.writeHead(204);return res.end();}
  if(req.method!=="POST") return send(res,405,{error:"POST requis"});
  try {
    const b=await body(req), number=Number(b.demarcheNumber);
    if(!number) return send(res,400,{error:"Numéro de démarche requis"});
    if(req.url==="/api/ds/test" || req.url==="/api/ds/procedure"){
      const d=(await gql(PROCEDURE,{number})).demarche;
      if(!d) throw new Error("Démarche introuvable ou non autorisée.");
      return send(res,200,{
        id:d.id, number:d.number, title:d.title,
        fields:(d.activeRevision?.champDescriptors||[]).map(x=>({id:x.id,label:x.label,type:x.type}))
      });
    }
    if(req.url==="/api/ds/dossiers"){
      let after=null, dossiers=[];
      do {
        const c=(await gql(DOSSIERS,{number,after})).demarche?.dossiers;
        if(!c) throw new Error("Impossible de lire les dossiers.");
        dossiers.push(...(c.nodes||[]).map(d=>({
          id:d.id, number:d.number, state:d.state,
          dateDerniereModification:d.dateDerniereModification,
          fields:(d.champs||[]).map(x=>({id:x.id,label:x.label,value:x.stringValue ?? ""}))
        })));
        after=c.pageInfo?.hasNextPage ? c.pageInfo.endCursor : null;
      } while(after);
      return send(res,200,{dossiers});
    }
    send(res,404,{error:"Route inconnue"});
  } catch(e) {
    send(res,500,{error:e.message});
  }
}).listen(PORT,()=>console.log(`Connecteur DS : http://localhost:${PORT}`));
