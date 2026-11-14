const CONFIG = {
  owner: "xdCL",
  repo: "Josts",
  branch: "sync-data",
  sourcePath: "sync/domains.txt",
  manifestUrl: "https://raw.githubusercontent.com/xdCL/Josts/sync-data/sync/manifest.json",
  sourceUrl: "https://raw.githubusercontent.com/xdCL/Josts/sync-data/sync/domains.txt",
  apiBase: location.hostname === "xdcl.github.io" ? "" : location.origin
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { original: [], draft: [], categories: [], editingId: null, backendReady: false };

function idFor(domain, index){ return domain + "::" + index; }
function normalizeDomain(value){
  let raw=(value||"").trim().toLowerCase();
  if(!raw) return "";
  try{
    const candidate = raw.includes("://") ? raw : "https://" + raw;
    const u = new URL(candidate);
    return u.hostname.replace(/\.$/,"");
  }catch{return raw.split("/")[0].split(":")[0].replace(/\.$/,"");}
}
function validDomain(d){
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(d);
}
function cleanCategory(line){
  return line.replace(/^#+\s*/,"").replace(/^[-=]+\s*/,"").replace(/\s*[-=]+$/,"").trim();
}
function parseSource(text){
  const rows=[]; let category="Otros"; let idx=0;
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(!line) continue;
    const off=line.match(/^#\s*\[off\]\s+(.+)$/i);
    if(off){
      const domain=normalizeDomain(off[1]);
      if(validDomain(domain)) rows.push({id:idFor(domain,idx++),domain,category,enabled:false});
      continue;
    }
    if(line.startsWith("#")){
      const candidate=cleanCategory(line);
      const ignored=/^(josts sync|este es|una línea|los comentarios|no escribas|para quitar|para agregar|=|inicio de sitios|fin)/i.test(candidate);
      if(candidate && !ignored && candidate.length<80) category=candidate;
      continue;
    }
    const parts=line.split(/\s+/);
    const rawDomain=/^(?:\d{1,3}\.){3}\d{1,3}$/.test(parts[0]) ? parts[1] : parts[0];
    const domain=normalizeDomain(rawDomain);
    if(validDomain(domain)) rows.push({id:idFor(domain,idx++),domain,category,enabled:true});
  }
  return rows;
}
function uniqueCategories(rows){return [...new Set(rows.map(x=>x.category||"Otros"))].sort((a,b)=>a.localeCompare(b,"es"))}
function cloneRows(rows){return rows.map(x=>({...x}))}
function domainKey(x){return x.domain}
function computeDiff(){
  const before=new Map(state.original.map(x=>[domainKey(x),x]));
  const after=new Map(state.draft.map(x=>[domainKey(x),x]));
  const diff=[];
  for(const [domain,row] of after){
    if(!before.has(domain)) diff.push({type:"add",domain,row});
    else{
      const old=before.get(domain);
      if(old.enabled!==row.enabled || old.category!==row.category) diff.push({type:"change",domain,row,old});
    }
  }
  for(const [domain,row] of before) if(!after.has(domain)) diff.push({type:"remove",domain,row});
  return diff;
}
function serialize(rows){
  const groups=new Map();
  for(const row of rows){
    const cat=row.category||"Otros";
    if(!groups.has(cat)) groups.set(cat,[]);
    groups.get(cat).push(row);
  }
  const out=[
    "# Josts Sync — lista maestra editable",
    "# Administrada desde Josts Control.",
    "# Las líneas '# [off] dominio.com' se conservan como permitidas/desactivadas.",
    ""
  ];
  for(const [category,items] of [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],"es"))){
    out.push("# --- "+category+" ---");
    for(const item of items.sort((a,b)=>a.domain.localeCompare(b.domain))){
      out.push(item.enabled ? item.domain : "# [off] "+item.domain);
    }
    out.push("");
  }
  return out.join("\n").trim()+"\n";
}
function refreshFilters(){
  state.categories=uniqueCategories(state.draft);
  const filter=$("#categoryFilter"), datalist=$("#categoryOptions");
  const current=filter.value;
  filter.innerHTML='<option value="">Todas las categorías</option>'+state.categories.map(c=>'<option>'+escapeHtml(c)+'</option>').join("");
  if(state.categories.includes(current)) filter.value=current;
  datalist.innerHTML=state.categories.map(c=>'<option value="'+escapeAttr(c)+'"></option>').join("");
}
function escapeHtml(v){const d=document.createElement("div");d.textContent=v;return d.innerHTML}
function escapeAttr(v){return escapeHtml(v).replace(/"/g,"&quot;")}
function render(){
  refreshFilters();
  const q=$("#searchInput").value.trim().toLowerCase();
  const cat=$("#categoryFilter").value;
  const st=$("#stateFilter").value;
  const rows=state.draft.filter(x=>{
    const match=!q||x.domain.includes(q)||(x.category||"").toLowerCase().includes(q);
    const matchCat=!cat||x.category===cat;
    const matchState=!st||(st==="active"?x.enabled:!x.enabled);
    return match&&matchCat&&matchState;
  });
  $("#activeCount").textContent=state.draft.filter(x=>x.enabled).length;
  $("#disabledCount").textContent=state.draft.filter(x=>!x.enabled).length;
  $("#categoryCount").textContent=state.categories.length;
  $("#domainRows").innerHTML=rows.map(row=>`
    <tr>
      <td><span class="domain-name">${escapeHtml(row.domain)}</span></td>
      <td><span class="category-chip">${escapeHtml(row.category||"Otros")}</span></td>
      <td>
        <label class="switch" title="${row.enabled?"Bloqueado":"Permitido"}">
          <input type="checkbox" data-toggle="${escapeAttr(row.id)}" ${row.enabled?"checked":""}>
          <span class="track"></span><span>${row.enabled?"Bloqueado":"Permitido"}</span>
        </label>
      </td>
      <td><div class="row-actions">
        <button data-edit="${escapeAttr(row.id)}" title="Editar">Editar</button>
        <button class="danger" data-delete="${escapeAttr(row.id)}" title="Eliminar">Eliminar</button>
      </div></td>
    </tr>`).join("");
  $("#emptyState").classList.toggle("hidden",rows.length>0);
  bindRows();
  renderPending();
}
function bindRows(){
  $$("[data-toggle]").forEach(el=>el.onchange=()=>{
    const row=state.draft.find(x=>x.id===el.dataset.toggle); if(!row)return;
    row.enabled=el.checked; render();
  });
  $$("[data-edit]").forEach(el=>el.onclick=()=>openEditor(el.dataset.edit));
  $$("[data-delete]").forEach(el=>el.onclick=()=>{
    const row=state.draft.find(x=>x.id===el.dataset.delete); if(!row)return;
    if(confirm("¿Quitar "+row.domain+" de Josts?")){state.draft=state.draft.filter(x=>x.id!==row.id);render()}
  });
}
function renderPending(){
  const diff=computeDiff(), bar=$("#pendingBar");
  bar.classList.toggle("hidden",diff.length===0);
  $("#pendingCount").textContent=diff.length===1?"1 cambio pendiente":diff.length+" cambios pendientes";
  const a=diff.filter(x=>x.type==="add").length,r=diff.filter(x=>x.type==="remove").length,c=diff.filter(x=>x.type==="change").length;
  $("#pendingSummary").textContent=[a&&"+"+a,r&&"−"+r,c&&"~"+c].filter(Boolean).join(" · ");
}
function openEditor(id=null){
  state.editingId=id;
  const row=id?state.draft.find(x=>x.id===id):null;
  $("#dialogTitle").textContent=row?"Editar dominio":"Agregar sitio";
  $("#domainInput").value=row?row.domain:"";
  $("#categoryInput").value=row?row.category:(state.categories[0]||"Otros");
  $("#wwwInput").checked=false; $("#wwwInput").closest("label").style.display=row?"none":"flex";
  $("#dialogError").textContent="";
  $("#editorDialog").showModal();
  setTimeout(()=>$("#domainInput").focus(),50);
}
function saveEditor(){
  const input=normalizeDomain($("#domainInput").value), category=$("#categoryInput").value.trim()||"Otros";
  if(!validDomain(input)){ $("#dialogError").textContent="Ingresa un dominio válido."; return false; }
  const duplicate=state.draft.find(x=>x.domain===input&&x.id!==state.editingId);
  if(duplicate){$("#dialogError").textContent="Ese dominio ya existe en la batería.";return false}
  if(state.editingId){
    const row=state.draft.find(x=>x.id===state.editingId); row.domain=input; row.category=category;
  }else{
    const id=idFor(input,Date.now());
    state.draft.push({id,domain:input,category,enabled:true});
    if($("#wwwInput").checked&&!input.startsWith("www.")){
      const www="www."+input;
      if(!state.draft.some(x=>x.domain===www)) state.draft.push({id:idFor(www,Date.now()+1),domain:www,category,enabled:true});
    }
  }
  render(); return true;
}
function showPublish(){
  const diff=computeDiff();
  $("#diffPreview").innerHTML=diff.length?diff.map(d=>{
    const symbol=d.type==="add"?"+":d.type==="remove"?"−":"~";
    const detail=d.type==="change"?(d.row.enabled?"bloqueado":"permitido")+" · "+d.row.category:(d.type==="add"?d.row.category:"quitar");
    return '<div class="diff-line '+d.type+'"><b>'+symbol+'</b><span>'+escapeHtml(d.domain)+'</span><span>'+escapeHtml(detail)+'</span></div>';
  }).join(""):'<div class="loading-block">No hay cambios.</div>';
  $("#confirmPublishBtn").disabled=!state.backendReady||!diff.length;
  $("#publishWarning").classList.toggle("hidden",state.backendReady);
  $("#publishDialog").showModal();
}
async function load(){
  $("#syncStatus").textContent="Leyendo…";
  try{
    const [sourceRes,manifestRes]=await Promise.all([
      fetch(CONFIG.sourceUrl,{cache:"no-store"}),
      fetch(CONFIG.manifestUrl,{cache:"no-store"})
    ]);
    if(!sourceRes.ok) throw new Error("No se pudo leer domains.txt");
    const parsed=parseSource(await sourceRes.text());
    state.original=parsed;state.draft=cloneRows(parsed);
    render();
    if(manifestRes.ok){
      const m=await manifestRes.json();
      $("#syncStatus").textContent="Operativo";
      $("#manifestText").textContent="versión "+String(m.version||"").slice(0,8);
    }else{
      $("#syncStatus").textContent="Sin manifiesto";
      $("#manifestText").textContent="revisar publicación";
    }
    toast("Batería actualizada");
  }catch(err){
    $("#domainRows").innerHTML='<tr><td colspan="4" class="loading">No se pudo cargar la batería. <a href="'+CONFIG.sourceUrl+'" target="_blank">Abrir fuente ↗</a></td></tr>';
    $("#syncStatus").textContent="Error";
    $("#manifestText").textContent=err.message;
  }
  loadActivity();
}
async function loadActivity(){
  try{
    const url="https://api.github.com/repos/"+CONFIG.owner+"/"+CONFIG.repo+"/commits?sha="+CONFIG.branch+"&path="+encodeURIComponent(CONFIG.sourcePath)+"&per_page=12";
    const res=await fetch(url,{headers:{"Accept":"application/vnd.github+json"}});
    if(!res.ok) throw new Error();
    const commits=await res.json();
    $("#activityList").innerHTML=commits.map(c=>{
      const d=new Date(c.commit.author.date);
      const when=new Intl.DateTimeFormat("es-CL",{dateStyle:"medium",timeStyle:"short"}).format(d);
      return '<div class="activity-item"><time>'+escapeHtml(when)+'</time><div><strong>'+escapeHtml(c.commit.message.split("\n")[0])+'</strong><p>'+escapeHtml(c.sha.slice(0,8))+'</p></div><a href="'+escapeAttr(c.html_url)+'" target="_blank" rel="noreferrer">Ver ↗</a></div>';
    }).join("")||'<div class="loading-block">Sin actividad.</div>';
  }catch{$("#activityList").innerHTML='<div class="loading-block">No fue posible consultar el historial.</div>'}
}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2200)}
async function initAuth(){
  const gateBtn=$("#gateLoginBtn");
  if(!CONFIG.apiBase){
    state.backendReady=false;
    gateBtn.onclick=()=>toast("Panel administrativo disponible sólo mediante acceso seguro.");
    return false;
  }
  try{
    const res=await fetch(CONFIG.apiBase+"/api/session",{credentials:"include",cache:"no-store"});
    const data=await res.json();
    state.backendReady=!!data.authenticated;
    if(data.authenticated){
      document.body.classList.remove("locked");
      document.body.classList.add("unlocked");
      $("#appShell").hidden=false;
      $("#connectionBadge").innerHTML="<span style='background:var(--green)'></span> "+escapeHtml(data.user);
      $("#loginBtn").innerHTML="Cerrar sesión · "+escapeHtml(data.user);
      $("#loginBtn").onclick=async()=>{
        await fetch(CONFIG.apiBase+"/api/logout",{method:"POST",credentials:"include"});
        location.reload();
      };
      $("#authState").textContent="Autenticado como "+data.user;
      $("#authState").classList.add("green");
      renderPending();
      return true;
    }
    gateBtn.onclick=()=>location.href=CONFIG.apiBase+"/api/login";
    return false;
  }catch{
    state.backendReady=false;
    gateBtn.onclick=()=>toast("El acceso administrativo no está disponible.");
    return false;
  }
}

function changeView(name){
  $$(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.view===name));
  $$(".view").forEach(x=>x.classList.remove("active"));
  $("#"+name+"View").classList.add("active");
  $("#viewTitle").textContent=name==="domains"?"Dominios":name==="activity"?"Actividad":"Configuración";
}
$$(".nav-item").forEach(x=>x.onclick=()=>changeView(x.dataset.view));
$("#searchInput").oninput=render;$("#categoryFilter").onchange=render;$("#stateFilter").onchange=render;
$("#addBtn").onclick=()=>openEditor();$("#reloadBtn").onclick=load;
$("#discardBtn").onclick=()=>{state.draft=cloneRows(state.original);render();toast("Cambios descartados")};
$("#publishBtn").onclick=showPublish;
$("#editorForm").addEventListener("submit",e=>{if(e.submitter?.value==="cancel")return;if(!saveEditor()){e.preventDefault();return}});
// El comportamiento del botón GitHub se define en initAuth().
$("#confirmPublishBtn").onclick=async e=>{
  e.preventDefault();
  if(!state.backendReady)return;
  // Contrato preparado para el backend: {content, changes}. No se ejecuta sin autenticación.
  const payload={content:serialize(state.draft),changes:computeDiff()};
  const res=await fetch(CONFIG.apiBase+"/api/publish",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  if(!res.ok){toast("No se pudo publicar");return}
  state.original=cloneRows(state.draft);render();$("#publishDialog").close();toast("Cambios publicados");
};
(async()=>{
  const ok=await initAuth();
  if(ok) await load();
})();
