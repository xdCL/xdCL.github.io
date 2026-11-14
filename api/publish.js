const {readSession,json,validateSource,github,OWNER,REPO,BRANCH,PATH}=require("./_lib");

module.exports=async(req,res)=>{
  if(req.method!=="POST") return json(res,405,{error:"Método no permitido"});
  const session=readSession(req);
  if(!session) return json(res,401,{error:"Debes iniciar sesión con GitHub."});

  let body=req.body;
  if(typeof body==="string"){try{body=JSON.parse(body)}catch{return json(res,400,{error:"JSON inválido"})}}
  const content=body&&body.content;
  if(typeof content!=="string") return json(res,400,{error:"Falta el contenido de la batería."});
  let rows; try{rows=validateSource(content)}catch(e){return json(res,400,{error:e.message})}

  try{
    const meta=await github("/repos/"+OWNER+"/"+REPO+"/contents/"+encodeURIComponent(PATH).replace(/%2F/g,"/")+"?ref="+encodeURIComponent(BRANCH));
    const encoded=Buffer.from(content,"utf8").toString("base64");
    const added=Array.isArray(body.changes)?body.changes.filter(x=>x.type==="add").length:0;
    const removed=Array.isArray(body.changes)?body.changes.filter(x=>x.type==="remove").length:0;
    const changed=Array.isArray(body.changes)?body.changes.filter(x=>x.type==="change").length:0;
    const message="sync: publish from Josts Control ("+added+"+ "+removed+"- "+changed+"~)";
    const out=await github("/repos/"+OWNER+"/"+REPO+"/contents/"+encodeURIComponent(PATH).replace(/%2F/g,"/"),{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message,content:encoded,sha:meta.sha,branch:BRANCH})
    });
    json(res,200,{ok:true,commit:out.commit?.sha||null,domains:rows.length});
  }catch(e){
    json(res,e.status===409?409:502,{error:"No se pudo publicar en GitHub.",detail:e.data?.message||e.message});
  }
};
