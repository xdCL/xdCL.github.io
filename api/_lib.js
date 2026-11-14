const crypto = require("crypto");

const ALLOWED_LOGIN = process.env.JOSTS_ADMIN_LOGIN || "xdCL";
const OWNER = process.env.JOSTS_REPO_OWNER || "xdCL";
const REPO = process.env.JOSTS_REPO_NAME || "Josts";
const BRANCH = process.env.JOSTS_REPO_BRANCH || "sync-data";
const PATH = process.env.JOSTS_REPO_PATH || "sync/domains.txt";

function b64url(input){
  return Buffer.from(input).toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function unb64url(input){
  input=input.replace(/-/g,"+").replace(/_/g,"/");
  while(input.length%4) input+="=";
  return Buffer.from(input,"base64");
}
function sessionKey(){
  const secret=process.env.SESSION_SECRET;
  if(!secret) throw new Error("Missing SESSION_SECRET");
  return crypto.createHash("sha256").update(secret).digest();
}
function makeSession(login,githubToken){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",sessionKey(),iv);
  const payload=Buffer.from(JSON.stringify({login,githubToken,exp:Date.now()+8*60*60*1000}),"utf8");
  const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [b64url(iv),b64url(tag),b64url(encrypted)].join(".");
}
function readCookies(req){
  const out={};
  const raw=req.headers.cookie||"";
  for(const part of raw.split(";")){
    const i=part.indexOf("=");
    if(i<0) continue;
    out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function readSession(req){
  try{
    const token=readCookies(req).josts_session;
    if(!token) return null;
    const [iv64,tag64,data64]=token.split(".");
    if(!iv64||!tag64||!data64) return null;
    const decipher=crypto.createDecipheriv("aes-256-gcm",sessionKey(),unb64url(iv64));
    decipher.setAuthTag(unb64url(tag64));
    const plain=Buffer.concat([decipher.update(unb64url(data64)),decipher.final()]);
    const data=JSON.parse(plain.toString("utf8"));
    if(!data.login||!data.githubToken||data.exp<Date.now()||data.login.toLowerCase()!==ALLOWED_LOGIN.toLowerCase()) return null;
    return data;
  }catch{return null}
}
function setSession(res,login,githubToken){
  const secure="Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800";
  res.setHeader("Set-Cookie","josts_session="+encodeURIComponent(makeSession(login,githubToken))+"; "+secure);
}
function clearSession(res){
  res.setHeader("Set-Cookie","josts_session=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}
function json(res,status,data){
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.end(JSON.stringify(data));
}
function redirect(res,url){
  res.statusCode=302;
  res.setHeader("Location",url);
  res.setHeader("Cache-Control","no-store");
  res.end();
}
function origin(req){
  const proto=(req.headers["x-forwarded-proto"]||"https").split(",")[0].trim();
  const host=req.headers["x-forwarded-host"]||req.headers.host;
  return proto+"://"+host;
}
function parseDomains(text){
  const rows=[]; let category="Otros";
  for(const raw of String(text||"").split(/\r?\n/)){
    const line=raw.trim();
    if(!line) continue;
    const off=line.match(/^#\s*\[off\]\s+(.+)$/i);
    if(off){ rows.push({domain:off[1].trim().toLowerCase(),category,enabled:false}); continue; }
    if(line.startsWith("#")){
      const c=line.replace(/^#+\s*/,"").replace(/^[-=]+\s*/,"").replace(/\s*[-=]+$/,"").trim();
      if(c && !/^(josts sync|administrada|las líneas|este es|una línea|los comentarios|no escribas|para quitar|para agregar)/i.test(c) && c.length<80) category=c;
      continue;
    }
    rows.push({domain:line.split(/\s+/).pop().trim().toLowerCase(),category,enabled:true});
  }
  return rows;
}
function validDomain(d){
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(d);
}
function validateSource(text){
  const rows=parseDomains(text);
  if(!rows.length) throw new Error("La batería no puede quedar vacía.");
  if(rows.length>10000) throw new Error("La batería supera el límite permitido.");
  const seen=new Set();
  for(const row of rows){
    if(!validDomain(row.domain)) throw new Error("Dominio inválido: "+row.domain);
    if(seen.has(row.domain)) throw new Error("Dominio duplicado: "+row.domain);
    seen.add(row.domain);
  }
  return rows;
}
async function github(path,options={},token){
  if(!token) throw new Error("Missing GitHub session token");
  const res=await fetch("https://api.github.com"+path,{
    ...options,
    headers:{
      "Accept":"application/vnd.github+json",
      "Authorization":"Bearer "+token,
      "X-GitHub-Api-Version":"2022-11-28",
      "User-Agent":"Josts-Control",
      ...(options.headers||{})
    }
  });
  const body=await res.text();
  let data; try{data=body?JSON.parse(body):null}catch{data=body}
  if(!res.ok){
    const e=new Error("GitHub "+res.status);
    e.status=res.status;e.data=data;throw e;
  }
  return data;
}

module.exports={ALLOWED_LOGIN,OWNER,REPO,BRANCH,PATH,setSession,clearSession,readSession,json,redirect,origin,validateSource,github};
