const {ALLOWED_LOGIN,setSession,json,redirect,origin}=require("./_lib");

function cookie(req,name){
  const raw=req.headers.cookie||"";
  for(const part of raw.split(";")){
    const [k,...rest]=part.trim().split("=");
    if(k===name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

module.exports=async(req,res)=>{
  if(req.method!=="GET") return json(res,405,{error:"Método no permitido"});
  const u=new URL(req.url,origin(req));
  const code=u.searchParams.get("code"),state=u.searchParams.get("state");
  if(!code||!state||state!==cookie(req,"josts_oauth_state")) return json(res,400,{error:"Estado OAuth inválido"});

  const tokenRes=await fetch("https://github.com/login/oauth/access_token",{
    method:"POST",
    headers:{"Accept":"application/json","Content-Type":"application/json","User-Agent":"Josts-Control"},
    body:JSON.stringify({
      client_id:process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret:process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code
    })
  });
  const token=await tokenRes.json();
  if(!token.access_token) return json(res,401,{error:"GitHub no autorizó la sesión"});

  const userRes=await fetch("https://api.github.com/user",{
    headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+token.access_token,"User-Agent":"Josts-Control"}
  });
  const user=await userRes.json();
  if(!userRes.ok||!user.login) return json(res,401,{error:"No se pudo verificar la cuenta GitHub"});
  if(user.login.toLowerCase()!==ALLOWED_LOGIN.toLowerCase()) return json(res,403,{error:"Esta cuenta no está autorizada para administrar Josts."});

  setSession(res,user.login,token.access_token);
  res.setHeader("Set-Cookie",[
    res.getHeader("Set-Cookie"),
    "josts_oauth_state=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
  ]);
  redirect(res,"/josts-admin/?login=ok");
};
