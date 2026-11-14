const {json,redirect,origin}=require("./_lib");

module.exports=async(req,res)=>{
  if(req.method!=="GET") return json(res,405,{error:"Método no permitido"});
  const client=process.env.GITHUB_OAUTH_CLIENT_ID;
  if(!client) return json(res,503,{error:"OAuth no configurado"});
  const state=crypto.randomUUID();
  res.setHeader("Set-Cookie","josts_oauth_state="+state+"; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600");
  const callback=origin(req)+"/api/callback";
  const url=new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id",client);
  url.searchParams.set("redirect_uri",callback);
  url.searchParams.set("scope","read:user");
  url.searchParams.set("state",state);
  redirect(res,url.toString());
};
const crypto=require("crypto");
