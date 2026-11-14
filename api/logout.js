const {clearSession,json}=require("./_lib");
module.exports=async(req,res)=>{
  if(req.method!=="POST") return json(res,405,{error:"Método no permitido"});
  clearSession(res);json(res,200,{ok:true});
};
