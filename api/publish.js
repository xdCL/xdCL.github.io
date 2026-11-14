const crypto=require("crypto");
const {readSession,json,validateSource,github,OWNER,REPO,BRANCH,PATH}=require("./_lib");

function sha256(text){return crypto.createHash("sha256").update(Buffer.from(text,"utf8")).digest("hex")}
function buildPack(rows){
  const active=rows.filter(x=>x.enabled);
  const lines=[
    "# Josts Sync — batería oficial generada por Josts Control",
    "# No editar manualmente: la fuente es sync/domains.txt.",
    ""
  ];
  let current="";
  for(const row of active){
    if(row.category!==current){
      current=row.category;
      lines.push("# --- "+current+" ---");
    }
    lines.push("127.0.0.1       "+row.domain);
  }
  return lines.join("\n").trim()+"\n";
}
function signManifest(pack){
  const key=process.env.JOSTS_SYNC_SIGNING_KEY;
  if(!key) throw new Error("Falta JOSTS_SYNC_SIGNING_KEY");
  const hash=sha256(pack);
  const stamp=new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14);
  const version="control-"+stamp+"-"+hash.slice(0,8);
  const payload="JOSTS-SYNC-1\n"+version+"\n"+hash+"\n";
  const signature=crypto.sign("RSA-SHA256",Buffer.from(payload,"utf8"),key).toString("base64");
  return {schema:1,version,sha256:hash,signature};
}
async function createBlob(content){
  return github("/repos/"+OWNER+"/"+REPO+"/git/blobs",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({content,encoding:"utf-8"})
  });
}

module.exports=async(req,res)=>{
  if(req.method!=="POST") return json(res,405,{error:"Método no permitido"});
  const session=readSession(req);
  if(!session) return json(res,401,{error:"Debes iniciar sesión con GitHub."});

  let body=req.body;
  if(typeof body==="string"){try{body=JSON.parse(body)}catch{return json(res,400,{error:"JSON inválido"})}}
  const content=body&&body.content;
  if(typeof content!=="string") return json(res,400,{error:"Falta el contenido de la batería."});

  let rows,pack,manifest;
  try{
    rows=validateSource(content);
    pack=buildPack(rows);
    manifest=signManifest(pack);
  }catch(e){return json(res,400,{error:e.message})}

  try{
    const ref=await github("/repos/"+OWNER+"/"+REPO+"/git/ref/heads/"+encodeURIComponent(BRANCH));
    const head=ref.object.sha;
    const commit=await github("/repos/"+OWNER+"/"+REPO+"/git/commits/"+head);

    const [domainsBlob,packBlob,manifestBlob]=await Promise.all([
      createBlob(content),
      createBlob(pack),
      createBlob(JSON.stringify(manifest)+"\n")
    ]);

    const tree=await github("/repos/"+OWNER+"/"+REPO+"/git/trees",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        base_tree:commit.tree.sha,
        tree:[
          {path:PATH,mode:"100644",type:"blob",sha:domainsBlob.sha},
          {path:"sync/hosts-pack.txt",mode:"100644",type:"blob",sha:packBlob.sha},
          {path:"sync/manifest.json",mode:"100644",type:"blob",sha:manifestBlob.sha}
        ]
      })
    });

    const changes=Array.isArray(body.changes)?body.changes:[];
    const added=changes.filter(x=>x.type==="add").length;
    const removed=changes.filter(x=>x.type==="remove").length;
    const changed=changes.filter(x=>x.type==="change").length;
    const newCommit=await github("/repos/"+OWNER+"/"+REPO+"/git/commits",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        message:"sync: publish from Josts Control ("+added+"+ "+removed+"- "+changed+"~)",
        tree:tree.sha,
        parents:[head]
      })
    });

    await github("/repos/"+OWNER+"/"+REPO+"/git/refs/heads/"+encodeURIComponent(BRANCH),{
      method:"PATCH",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({sha:newCommit.sha,force:false})
    });

    json(res,200,{
      ok:true,
      commit:newCommit.sha,
      version:manifest.version,
      sha256:manifest.sha256,
      domains:rows.filter(x=>x.enabled).length,
      disabled:rows.filter(x=>!x.enabled).length
    });
  }catch(e){
    const conflict=e.status===409||e.status===422;
    json(res,conflict?409:502,{
      error:conflict?"La batería cambió mientras publicabas. Actualiza el panel e inténtalo otra vez.":"No se pudo publicar en GitHub.",
      detail:e.data?.message||e.message
    });
  }
};
