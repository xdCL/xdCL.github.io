const {readSession,json}=require("./_lib");
module.exports=async(req,res)=>{
  if(req.method!=="GET") return json(res,405,{error:"Método no permitido"});
  const session=readSession(req);
  json(res,200,{authenticated:!!session,user:session?session.login:null});
};
