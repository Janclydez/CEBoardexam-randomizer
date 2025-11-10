// Beam Deflection Lite — Multi-Span FEA (+ exact V/M & analytic extrema)
// Conventions: P,w downward (+). CCW moment (+). Display: V up (+).

const $  = q => document.querySelector(q);
const $$ = q => Array.from(document.querySelectorAll(q));

const svg       = $("#svg");
const loadsWrap = $("#loads");
const spansEl   = $("#spans");
const EEl       = $("#E");
const IEl       = $("#I");
const nelEl     = $("#nelTotal");
const exactBox  = $("#exactify");

$("#addPoint").onclick  = () => addRow("point");
$("#addUDL").onclick    = () => addRow("udl");
$("#addMoment").onclick = () => addRow("moment");
$("#resetAll").onclick  = () => {
  loadsWrap.innerHTML="";
  $("#results").hidden=true;
  svg.parentElement.querySelectorAll("svg:not(#svg)").forEach(n=>n.remove());
  svg.innerHTML="";
  drawPreview();
};
$("#solve").onclick       = solve;
$("#downloadCSV").onclick = downloadCSV;
$("#addProbe")?.addEventListener("click", addProbeRow);

spansEl.addEventListener("input", () => {
  rebuildJointSupportPanel();
  ensureLoadSpanSelectors();
  ensureProbeSpanSelectors();
  drawPreview();
});

// ---------- UI helpers ----------
function addRow(kind){
  const tpl = $("#row-"+kind);
  const frag = tpl.content.cloneNode(true);
  const row = frag.querySelector(".load-row");
  const spanSel = document.createElement("label");
  spanSel.innerHTML = `Span <select name="spanIdx"></select>`;
  spanSel.style.minWidth = "120px";
  row.insertBefore(spanSel, row.querySelector(".remove"));
  loadsWrap.appendChild(frag);
  refreshRemoveHandlers();
  populateSpanOptions(row.querySelector('select[name="spanIdx"]'));
  drawPreview();
}
function addProbeRow(){
  const tpl = $("#row-probe"); if (!tpl) return;
  const frag = tpl.content.cloneNode(true);
  const row = frag.querySelector(".load-row");
  const spanSel = document.createElement("label");
  spanSel.innerHTML = `Span <select name="spanIdx"></select>`;
  spanSel.style.minWidth = "120px";
  row.insertBefore(spanSel, row.querySelector(".remove"));
  $("#probes").appendChild(frag);
  refreshRemoveHandlers();
  populateSpanOptions(row.querySelector('select[name="spanIdx"]'));
  drawPreview();
}
function refreshRemoveHandlers(){
  $$(".load-row .remove").forEach(btn => btn.onclick = (e)=>{
    e.target.closest(".load-row").remove();
    drawPreview();
  });
}
function populateSpanOptions(select){
  const spans = parseSpans();
  select.innerHTML = spans.map((_,i)=>`<option value="${i}">${i+1}</option>`).join("");
}
function ensureLoadSpanSelectors(){ $$(".load-row select[name='spanIdx']").forEach(s => populateSpanOptions(s)); }
function ensureProbeSpanSelectors(){ $$("#probes .load-row select[name='spanIdx']").forEach(s => populateSpanOptions(s)); }

// ---------- math helpers ----------
const zeros=(n,m)=>Array.from({length:n},()=>Array(m).fill(0));
const vec  =(n,val=0)=>Array(n).fill(val);
const addTo=(A,i,j,v)=>A[i][j]+=v;
const addv =(V,i,v)=>V[i]+=v;
const fmt  =(x,d=5)=>!isFinite(x)?"—":(Math.abs(x)<1e-3||Math.abs(x)>=1e5?x.toExponential(d):(+x.toFixed(d)));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approxFraction = (x) => {
  try {
    const f = math.fraction(x);
    if (Math.abs(f.d) > 1e6) return null;
    return `${f.n}/${f.d}`;
  } catch { return null; }
};

// ---------- spans / joints / inertia ----------
function parseSpans(){ return spansEl.value.split(/[,+]/).map(s=>parseFloat(s.trim())).filter(x=>x>0); }
function cumEnds(spans){ const a=[0]; for (const L of spans) a.push(a.at(-1)+L); return a; }
function parseIList(spans){
  const raw = IEl.value.split(/[,+]/).map(s=>s.trim()).filter(s=>s.length>0);
  const vals = raw.map(v=>parseFloat(v)).filter(v=>v>0);
  if (!vals.length) return spans.map(()=>parseFloat(IEl.value)||0);
  if (vals.length===1) return spans.map(()=>vals[0]);
  const arr=[]; for (let i=0;i<spans.length;i++) arr.push(vals[i] ?? vals.at(-1));
  return arr;
}

// --- must-nodes helpers (we keep your mesh but force all discontinuities to be nodes)
function uniqSort(xs, tol = 1e-10){ xs.sort((a,b)=>a-b); const out=[]; for(const x of xs) if(!out.length||Math.abs(x-out.at(-1))>tol) out.push(x); return out; }
function collectMustNodes(spans, loads, Ltot){
  const ends=[0]; for(const L of spans) ends.push(ends.at(-1)+L);
  const xs=[...ends];
  for(const L of loads){ if(L.kind==="Point"||L.kind==="Moment") xs.push(L.xg); if(L.kind==="UDL"){ xs.push(L.xa,L.xb); } }
  return uniqSort(xs);
}
function buildNodesFromMust(xs, nelTarget, Ltot){
  const hTarget = Ltot/Math.max(1,nelTarget);
  const nodes=[xs[0]];
  for(let i=0;i<xs.length-1;i++){
    const a=xs[i],b=xs[i+1],seg=b-a;
    const nSeg=Math.max(1,Math.round(seg/hTarget));
    for(let k=1;k<=nSeg;k++) nodes.push(a+(seg*k)/nSeg);
  }
  return nodes;
}
function nodeIndexAtX(nodes,x,tol=1e-10){ for(let i=0;i<nodes.length;i++) if(Math.abs(nodes[i]-x)<tol) return i;
  let best=0,d=Math.abs(nodes[0]-x); for(let i=1;i<nodes.length;i++){const di=Math.abs(nodes[i]-x); if(di<d){d=di;best=i;}} return best; }

// --- DOF map with split θ at hinges (built on non-uniform nodes)
function buildDofMapFromNodes(nodes, ends, jointTypes){
  const nn=nodes.length;
  const jointNode = ends.map(x=>nodeIndexAtX(nodes,x));
  const hingeAtNode = new Array(nn).fill(false);
  for(let j=1;j<jointTypes.length-1;j++) if(jointTypes[j]==="HINGE") hingeAtNode[jointNode[j]]=true;
  let next=0; const vidx=new Array(nn), thL=new Array(nn), thR=new Array(nn);
  for(let i=0;i<nn;i++) vidx[i]=next++;
  for(let i=0;i<nn;i++){ if(hingeAtNode[i]){ thL[i]=next++; thR[i]=next++; } else { const id=next++; thL[i]=id; thR[i]=id; } }
  return {vidx,thL,thR,ndof:next,jointNode,hingeAtNode};
}

// --- rendering helpers
function svgGroup(){ return document.createElementNS("http://www.w3.org/2000/svg","g"); }
function svgPath(d,cls){ const p=document.createElementNS("http://www.w3.org/2000/svg","path"); p.setAttribute("d",d); p.setAttribute("class",cls); return p; }
function svgText(t,x,y,size="11px"){ const el=document.createElementNS("http://www.w3.org/2000/svg","text"); el.setAttribute("x",x); el.setAttribute("y",y); el.setAttribute("fill","#9bb0c5"); el.setAttribute("font-size",size); el.textContent=t; return el; }
function trianglePath(cx,cy,w,h){ return `M${cx-w/2},${cy}L${cx+w/2},${cy}L${cx},${cy+h}Z`; }
function pointArrow(x,yTop,dir=+1,len=18,head=6){ const y1=yTop,y2=yTop+dir*len; const d=`M${x},${y1}L${x},${y2} M${x-head},${y2-dir*head}L${x},${y2}L${x+head},${y2-dir*head}`; return svgPath(d,"load-arrow"); }
// no-fill bold moment curl
function momentCurl(x, yTop, ccw = +1){
  const r=12,cx=x,cy=yTop,sweep=ccw>0?1:0,sx=cx-r,sy=cy,ex=cx+r,ey=cy;
  const g=document.createElementNS("http://www.w3.org/2000/svg","g"); g.setAttribute("fill","none");
  const halo=document.createElementNS("http://www.w3.org/2000/svg","path");
  halo.setAttribute("d",`M${sx},${sy} A ${r},${r} 0 1 ${sweep} ${ex},${ey}`); halo.setAttribute("fill","none");
  halo.setAttribute("stroke","rgba(255,255,255,0.28)"); halo.setAttribute("stroke-width","6"); halo.setAttribute("stroke-linecap","round"); halo.setAttribute("stroke-linejoin","round");
  halo.setAttribute("style","fill:none!important"); g.appendChild(halo);
  const arc=document.createElementNS("http://www.w3.org/2000/svg","path");
  arc.setAttribute("d",`M${sx},${sy} A ${r},${r} 0 1 ${sweep} ${ex},${ey}`); arc.setAttribute("class","load-arrow");
  arc.setAttribute("fill","none"); arc.setAttribute("stroke-width","3"); arc.setAttribute("stroke-linecap","round"); arc.setAttribute("stroke-linejoin","round"); arc.setAttribute("style","fill:none!important");
  g.appendChild(arc);
  const head=document.createElementNS("http://www.w3.org/2000/svg","path");
  const headD=(ccw>0)?`M${ex},${ey} L${ex-8},${ey-8} M${ex},${ey} L${ex-8},${ey+8}`:`M${sx},${sy} L${sx+8},${sy-8} M${sx},${sy} L${sx+8},${sy+8}`;
  head.setAttribute("d",headD); head.setAttribute("class","load-arrow"); head.setAttribute("fill","none"); head.setAttribute("stroke-width","3"); head.setAttribute("stroke-linecap","round"); head.setAttribute("stroke-linejoin","round"); head.setAttribute("style","fill:none!important");
  g.appendChild(head);
  return g;
}

// --- shapes / field recovery (Hermite)
function hermiteShape(h, s){
  const N1 = 1 - 3*s*s + 2*s*s*s;
  const N2 = h*(s - 2*s*s + s*s*s);
  const N3 = 3*s*s - 2*s*s*s;
  const N4 = h*(-s*s + s*s*s);
  return [N1, N2, N3, N4];
}
function hermiteField(h, EI, dofs, s){
  const v1=dofs[0], t1=dofs[1], v2=dofs[2], t2=dofs[3];
  const N1 = 1 - 3*s*s + 2*s*s*s;
  const N2 = h*(s - 2*s*s + s*s*s);
  const N3 = 3*s*s - 2*s*s*s;
  const N4 = h*(-s*s + s*s*s);
  const dN1 = (-6*s + 6*s*s)/h;
  const dN2 = (1 - 4*s + 3*s*s);
  const dN3 = ( 6*s - 6*s*s)/h;
  const dN4 = (-2*s + 3*s*s);
  const d2N1 = (-6 + 12*s)/(h*h);
  const d2N2 = (-4 + 6*s)/h;
  const d2N3 = ( 6 - 12*s)/(h*h);
  const d2N4 = (-2 + 6*s)/h;
  const d3N1 = (12)/(h*h*h);
  const d3N2 = (6)/(h*h);
  const d3N3 = (-12)/(h*h*h);
  const d3N4 = (6)/(h*h);

  const v  = N1*v1 + N2*t1 + N3*v2 + N4*t2;
  const th = dN1*v1 + dN2*t1 + dN3*v2 + dN4*t2;
  const curv = d2N1*v1 + d2N2*t1 + d2N3*v2 + d2N4*t2;
  const M  = EI * curv;
  const V  = EI * (d3N1*v1 + d3N2*t1 + d3N3*v2 + d3N4*t2);
  return {v, th, M, V};
}

function thicknessScale(Ilist){
  const Ipos=Ilist.map(v=>Math.max(v,1e-12));
  const Imed=Ipos.slice().sort((a,b)=>a-b)[Math.floor(Ipos.length/2)];
  return v => Math.max(4, Math.min(14, 8*Math.cbrt(Math.max(v,1e-12)/Imed)));
}

// ---------- DOF mapping (fallback, unused now) ----------
function buildDofMap(nel, Ltot, ends, jointTypes){
  const nn=nel+1;
  const jointNode = ends.map(x=>Math.round((x/Ltot)*nel));
  const hingeAtNode=new Array(nn).fill(false);
  for(let j=1;j<jointTypes.length-1;j++){ const n=jointNode[j]; if(jointTypes[j]==="HINGE") hingeAtNode[n]=true; }
  let next=0;
  const vidx=new Array(nn), thL=new Array(nn), thR=new Array(nn);
  for(let i=0;i<nn;i++) vidx[i]=next++;
  for(let i=0;i<nn;i++){ if(hingeAtNode[i]){ thL[i]=next++; thR[i]=next++; } else { const id=next++; thL[i]=id; thR[i]=id; } }
  return {vidx,thL,thR,ndof:next,jointNode,hingeAtNode};
}

// ---------- Assemble with must-nodes ----------
function currentLoadsForDrawing(spans, ends){
  const out=[];
  for(const row of $$(".load-row")){
    const kind=row.querySelector(".badge").textContent.trim();
    const spanIdx=parseInt(row.querySelector('select[name="spanIdx"]').value,10);
    const Lspan=spans[spanIdx]??0, x0=ends[spanIdx];
    if(kind==="Point"){
      const PkN=parseFloat(row.querySelector('[name="P"]').value||"0");
      const xloc=parseFloat(row.querySelector('[name="x"]').value||"0");
      const xg=x0+clamp(xloc,0,Lspan); if(PkN!==0) out.push({kind:"Point",xg,PkN});
    }else if(kind==="UDL"){
      let w1=parseFloat(row.querySelector('[name="w1"]').value||"0");
      let w2=parseFloat(row.querySelector('[name="w2"]').value||"0");
      let aLoc=parseFloat(row.querySelector('[name="a"]').value||"0");
      let bLoc=parseFloat(row.querySelector('[name="b"]').value||"0");
      let a=x0+clamp(aLoc,0,Lspan), b=x0+clamp(bLoc,0,Lspan);
      if(b<a){[a,b]=[b,a];[w1,w2]=[w2,w1];}
      if(b>a&&(w1!==0||w2!==0)) out.push({kind:"UDL",xa:a,xb:b,w1,w2});
    }else if(kind==="Moment"){
      const MkNm=parseFloat(row.querySelector('[name="M"]').value||"0");
      const dir=row.querySelector('[name="mdir"]')?.value==="CW"?-1:1;
      const xloc=parseFloat(row.querySelector('[name="x"]').value||"0");
      const xg=x0+clamp(xloc,0,Lspan); if(MkNm!==0) out.push({kind:"Moment",xg,sign:Math.sign(MkNm*dir),MkNm:Math.abs(MkNm)});
    }
  }
  return out;
}
function parseLoadsFull(spans, ends){
  const points=[], udls=[], moments=[];
  for(const row of $$(".load-row")){
    const kind=row.querySelector(".badge").textContent.trim();
    const spanIdx=parseInt(row.querySelector('select[name="spanIdx"]').value,10);
    const Lspan=spans[spanIdx]??0, x0=ends[spanIdx];
    if(kind==="Point"){
      const PkN=parseFloat(row.querySelector('[name="P"]').value||"0");
      const xloc=parseFloat(row.querySelector('[name="x"]').value||"0");
      const xg=x0+clamp(xloc,0,Lspan); if(PkN!==0) points.push({x:xg,P:PkN});
    }else if(kind==="UDL"){
      let w1=parseFloat(row.querySelector('[name="w1"]').value||"0");
      let w2=parseFloat(row.querySelector('[name="w2"]').value||"0");
      let aLoc=parseFloat(row.querySelector('[name="a"]').value||"0");
      let bLoc=parseFloat(row.querySelector('[name="b"]').value||"0");
      let a=x0+clamp(aLoc,0,Lspan), b=x0+clamp(bLoc,0,Lspan);
      if(b<a){[a,b]=[b,a];[w1,w2]=[w2,w1];}
      if(b>a&&(w1!==0||w2!==0)) udls.push({a,b,w1,w2});
    }else if(kind==="Moment"){
      const M=parseFloat(row.querySelector('[name="M"]').value||"0");
  const dir=row.querySelector('[name="mdir"]')?.value==="CW"? 1 : -1;  // CW(+), CCW(–)
  const xloc=parseFloat(row.querySelector('[name="x"]').value||"0");
  const xg=x0+clamp(xloc,0,Lspan);
  if(M!==0) moments.push({x:xg,M:dir*M}); // CW(+), CCW(–) for analytic diagram
    }
  }
  return {points,udls,moments};
}

function assemble(spans, E, Ilist, nelTarget, jointTypes){
  const ends = cumEnds(spans);
  const Ltot = ends.at(-1) || 1;
  const loadsForGrid=currentLoadsForDrawing(spans, ends);
  const must=collectMustNodes(spans, loadsForGrid, Ltot);
  const nodes=buildNodesFromMust(must, nelTarget, Ltot);
  const nel=nodes.length-1, nn=nodes.length;
  const map=buildDofMapFromNodes(nodes, ends, jointTypes);
  const ndof=map.ndof;

  const K=zeros(ndof,ndof), F=vec(ndof,0);
  const fe_elem=Array.from({length:nel},()=>[0,0,0,0]);
  const Pnod=vec(nn,0), Mnod=vec(nn,0);

  const spanIndexAtX = (x) => { let i=0; while(i<spans.length && x>ends[i+1]-1e-12) i++; return i; };

  // point loads
  for (const row of $$(".load-row")){
    const kind=row.querySelector(".badge").textContent.trim();
    const spanIdx=parseInt(row.querySelector('select[name="spanIdx"]')?.value ?? "0",10);
    const Lspan=spans[spanIdx]??0, x0=ends[spanIdx];
    if(kind==="Point"){
      const PkN=parseFloat(row.querySelector('[name="P"]').value||"0");
      const xloc=parseFloat(row.querySelector('[name="x"]').value||"0");
      if(!isFinite(PkN)||!isFinite(xloc)) continue;
      const xg=x0+clamp(xloc,0,Lspan);
      const i = nodeIndexAtX(nodes, xg);
      Pnod[i] -= PkN*1e3; // N (FE sign)
    }
  }

  // UDLs (consistent)
  for (const row of $$(".load-row")){
    const kind=row.querySelector(".badge").textContent.trim();
    if(kind!=="UDL") continue;
    const spanIdx=parseInt(row.querySelector('select[name="spanIdx"]')?.value ?? "0",10);
    const Lspan=spans[spanIdx]??0, x0=ends[spanIdx];
    let w1=parseFloat(row.querySelector('[name="w1"]').value||"0");
    let w2=parseFloat(row.querySelector('[name="w2"]').value||"0");
    let aLoc=parseFloat(row.querySelector('[name="a"]').value||"0");
    let bLoc=parseFloat(row.querySelector('[name="b"]').value||"0");
    let a=x0+clamp(aLoc,0,Lspan), b=x0+clamp(bLoc,0,Lspan);
    if(b<a){[a,b]=[b,a];[w1,w2]=[w2,w1];}
    const xa=Math.max(0,Math.min(Ltot,a)), xb=Math.max(0,Math.min(Ltot,b));
    if (xb<=xa+1e-12) continue;
    const slope=(w2-w1)/(b-a||1);
    for(let e=0;e<nel;e++){
      const xL=nodes[e], xR=nodes[e+1], h=xR-xL;
      const s=Math.max(xa,xL), t=Math.min(xb,xR);
      if(t<=s+1e-12) continue;
      const qL_kNm=w1+slope*(xL-a), qR_kNm=w1+slope*(xR-a);
      const qL=-qL_kNm*1e3, qR=-qR_kNm*1e3; // N/m
      const ratio=(t-s)/h;
      const fe=[ h*(0.35*qL+0.15*qR), h*h*(0.05*qL+1/30*qR),
                 h*(0.15*qL+0.35*qR), -h*h*(1/30*qL+0.05*qR) ].map(v=>v*ratio);
      for(let i=0;i<4;i++) fe_elem[e][i]+=fe[i];
    }
  }

  // point moments
  for (const row of $$(".load-row")){
    const kind=row.querySelector(".badge").textContent.trim();
    if(kind!=="Moment") continue;
    const spanIdx=parseInt(row.querySelector('select[name="spanIdx"]')?.value ?? "0",10);
    const Lspan=spans[spanIdx]??0, x0=ends[spanIdx];
    let MkNm=parseFloat(row.querySelector('[name="M"]').value||"0");
    const dir=row.querySelector('[name="mdir"]')?.value==="CW"?-1:1; MkNm*=dir;
    const xloc=parseFloat(row.querySelector('[name="x"]').value||"0");
    if(!isFinite(MkNm)||!isFinite(xloc)) continue;
    const xg=x0+clamp(xloc,0,Lspan);
    const i=nodeIndexAtX(nodes,xg);
    Mnod[i]+=MkNm*1e3; // N·m
  }

  // element assembly
  for(let e=0;e<nel;e++){
    const xL=nodes[e], xR=nodes[e+1], h=xR-xL;
    const xmid=0.5*(xL+xR), sIdx=spanIndexAtX(xmid);
    const EI=(E*1e9)*(Ilist[sIdx] ?? Ilist.at(-1));
    const c=EI/(h**3);
    const keBase=[[12,6*h,-12,6*h],[6*h,4*h*h,-6*h,2*h*h],[-12,-6*h,12,-6*h],[6*h,2*h*h,-6*h,4*h*h]];
    const ke=keBase.map(r=>r.map(v=>v*c));
    const dof=[map.vidx[e],map.thR[e],map.vidx[e+1],map.thL[e+1]];
    for(let i=0;i<4;i++) for(let j=0;j<4;j++) addTo(K,dof[i],dof[j],ke[i][j]);
    addv(F,dof[0],fe_elem[e][0]); addv(F,dof[1],fe_elem[e][1]); addv(F,dof[2],fe_elem[e][2]); addv(F,dof[3],fe_elem[e][3]);
  }
  for(let i=0;i<nn;i++){
    if(Pnod[i]) addv(F,map.vidx[i],Pnod[i]);
    if(Mnod[i]){ if(map.thL[i]===map.thR[i]) addv(F,map.thL[i],Mnod[i]); else { addv(F,map.thL[i],0.5*Mnod[i]); addv(F,map.thR[i],0.5*Mnod[i]); } }
  }

  // supports
  const restrained=[];
  for(let j=0;j<jointTypes.length;j++){
    const node=map.jointNode[j], t=jointTypes[j];
    if(t==="PIN")  restrained.push(map.vidx[node]);
    if(t==="FIX")  restrained.push(map.vidx[node], map.thL[node], map.thR[node]);
  }

  const endsSnap = jointTypes.map((_, j) => nodes[map.jointNode[j]]);

  return {K, F, restrained, nodes, nel, nn, Ltot, ends, spans, jointTypes, E, Ilist, map, endsSnap};
}

function solveSystem(K,F,restrained){
  const ndof=F.length, Rset=new Set(restrained), free=[];
  for(let i=0;i<ndof;i++) if(!Rset.has(i)) free.push(i);
  const Kr=free.map(i=>free.map(j=>K[i][j]));
  const Fr=free.map(i=>F[i]);
  const n=Kr.length, A=Kr.map((r,i)=>r.concat([Fr[i]]));
  for(let i=0;i<n;i++){
    let p=i; for(let r=i+1;r<n;r++) if(Math.abs(A[r][i])>Math.abs(A[p][i])) p=r;
    [A[i],A[p]]=[A[p],A[i]];
    const d=A[i][i]||1; for(let j=i;j<=n;j++) A[i][j]/=d;
    for(let r=0;r<n;r++) if(r!==i){ const f=A[r][i]; for(let j=i;j<=n;j++) A[r][j]-=f*A[i][j]; }
  }
  const Ur=A.map(r=>r[n]), U=vec(ndof,0); free.forEach((d,i)=>U[d]=Ur[i]);
  const KU=vec(ndof,0); for(let i=0;i<ndof;i++){ let s=0; for(let j=0;j<ndof;j++) s+=K[i][j]*U[j]; KU[i]=s; }
  const R=restrained.map(d=>KU[d]-F[d]);
  return {U,R};
}

// ---------- Field sampling ----------
function buildFields(asb, U, samplesPerEl=12){
  const {nodes, nel, E, Ilist, spans, map} = asb;
  const xs=[],V=[],M=[],th=[],v=[];
  const ends=cumEnds(spans);
  const spanIndexAtX = (x) => { let i=0; while(i<spans.length && x>ends[i+1]-1e-12) i++; return i; };
  for(let e=0;e<nel;e++){
    const xL=nodes[e], xR=nodes[e+1], h=xR-xL;
    const dofs=[U[map.vidx[e]],U[map.thR[e]],U[map.vidx[e+1]],U[map.thL[e+1]]];
    const xmid=0.5*(xL+xR), sIdx=spanIndexAtX(xmid);
    const EIe=(E*1e9)*(Ilist[sIdx] ?? Ilist.at(-1));
    const kStart=(e===0)?0:1;
    for(let k=kStart;k<=samplesPerEl;k++){
      const s=k/samplesPerEl, x=xL+s*h;
      const f=hermiteField(h,EIe,dofs,s);
      xs.push(x); V.push(f.V); M.push(f.M); th.push(f.th); v.push(f.v);
    }
  }
  const leftType=asb.jointTypes[0], rightType=asb.jointTypes.at(-1);
  if(leftType==="PIN"||leftType==="NONE") M[0]=0;
  if(rightType==="PIN"||rightType==="NONE") M[M.length-1]=0;
  // --- clamp θ, δ, V at joints on sampled arrays ---
{
  const ends = cumEnds(asb.spans);
  const jt   = asb.jointTypes;
  const idxAt = (x) => {
    for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i] - x) < 1e-10) return i;
    return -1;
  };
  for (let j = 0; j < ends.length; j++) {
    const i = idxAt(ends[j]);
    if (i < 0) continue;
    // δ = 0 at PIN/FIX
    if (jt[j] === "PIN" || jt[j] === "FIX") v[i] = 0;
    // θ = 0 at FIX
    if (jt[j] === "FIX") th[i] = 0;
    // right-end shear is zero by equilibrium
    if (j === ends.length - 1) V[i] = 0;
  }
}

  return {x:xs,V,M,th,v};
}

// ---------- Exact VM from statics (mesh-independent) ----------
function buildVMExact(asb, jointReactions){
  const spans=asb.spans, ends=asb.endsSnap ?? asb.ends, Ltot=asb.Ltot;
  const {points,udls,moments} = parseLoadsFull(spans, ends);

  const reacts = jointReactions
    .filter(r=>r.kind==="V")
    .map(r=>({x:ends[r.joint], R:r.val/1e3})); // kN

// reaction moments at fixed joints (kN·m), CCW positive
const rMoms = jointReactions
  .filter(r => r.kind === "M")
  .map(r => ({ x: ends[r.joint], M: r.val / 1e3 }));

  // helper: total load intensity at x within an interval, as linear a+b*(x-x0)
  function wAt(x){ // kN/m
    let w=0;
    for(const u of udls){
      if(x>=u.a-1e-12 && x<=u.b+1e-12){
        const slope=(u.w2-u.w1)/(u.b-u.a||1);
        w += u.w1 + slope*(x - u.a);
      }
    }
    return w;
  }
  // integrate w over [s,t]
  function W(s,t){ if(t<=s) return 0; let sum=0;
    for(const u of udls){
      const a=Math.max(s,u.a), b=Math.min(t,u.b);
      if(b<=a) continue;
      const alpha=(u.w2-u.w1)/(u.b-u.a||1);
      const L=b-a;
      sum += u.w1*(L) + alpha*0.5*( (b-u.a)**2 - (a-u.a)**2 );
    }
    return sum; // kN
  }

// integrate w(ξ)·(x-ξ) dξ over the portion of a UDL that lies in [a,x]
function Mint(x) { // kN·m
  let sum = 0;
  for (const u of udls) {
    const a = u.a, b = u.b;
    if (x <= a) continue;
    const cl = Math.min(x, b);             // clip on the right
    const L  = cl - a;                      // active length inside [a,x]
    const alpha = (u.w2 - u.w1) / (b - a || 1); // linear slope (kN/m^2)

    // ∫_a^{cl} [w1 + alpha(ξ-a)] · (x-ξ) dξ
    // = w1[(x-a)L - ½L²] + alpha[½(x-a)L² - ⅓L³]
    sum += u.w1 * ((x - a) * L - 0.5 * L * L)
         + alpha * (0.5 * (x - a) * L * L - (L * L * L) / 3);
  }
  return sum;
}


  function Vexact(x){ // kN (just to the right of x)
    let S=0;
    for(const r of reacts) if(r.x <= x+1e-12) S += r.R;
    for(const p of points) if(p.x <= x+1e-12) S -= p.P;
    S -= W(0, Math.max(0, Math.min(x, Ltot)));
    return S;
  }
function Mexact(x){ // kN·m (right-limit)
  let M = 0;

  // vertical reactions and point loads
  for (const r of reacts)  if (r.x <= x + 1e-12) M += r.R * (x - r.x);
  for (const p of points)  if (p.x <= x + 1e-12) M -= p.P * (x - p.x);

  // distributed loads
  M -= Mint(x);

  // applied point moments (CCW +) and REACTION moments at fixed ends
  for (const m  of moments) if (m.x  <= x + 1e-12) M += m.M;
  for (const rm of rMoms)   if (rm.x <= x + 1e-12) M += rm.M;

  // pins / free ends must read zero moment exactly at the ends
  if ((Math.abs(x - 0)    < 1e-4 && (asb.jointTypes[0]              === "PIN" || asb.jointTypes[0]              === "NONE")) ||
      (Math.abs(x - Ltot) < 1e-4 && (asb.jointTypes.at(-1)          === "PIN" || asb.jointTypes.at(-1)          === "NONE")))
    return 0;

  return M;
}

// --- Corrected moment using your rule: Mcorr(x) = Mexact(x) - 2 * M_left
// M_left from joint reactions (kN·m), CCW positive, CW negative
const Mleft_kNm = (jointReactions.find(r => r.kind === 'M' && r.joint === 0)?.val || 0) / 1e3;

function Mcorr(x){
  return Mexact(x) - 2 * Mleft_kNm;
}


  // joint left/right limits
  const joints = ends.map(x=>{
    const eps=1e-10;
    return {
      x,
      V_L: Vexact(x-eps), V_R: Vexact(x+eps),
      M_L: Mcorr(x-eps), M_R: Mcorr(x+eps)
    };
  });

  // find exact x where V crosses 0 inside intervals
  function maxMomentAbs(){
    const xs = uniqSort([
      0, ...ends,
      ...udls.flatMap(u=>[u.a,u.b]),
      ...points.map(p=>p.x)
    ]);
    let S = Vexact(xs[0]+1e-10);
    let best = {x:0,val:Math.abs(Mcorr(0))};
    for(let i=0;i<xs.length-1;i++){
      const a = xs[i], b = xs[i+1], dx=b-a-0; if(dx<=1e-12) continue;
      // w_total(x) = w0 + s*(x-a)
      const eps  = 1e-10;
const w0   = wAt(a + eps);                     // right-limit at a
const slope= (wAt(b - eps) - wAt(a + eps))/dx; // left-limit at b
      const S_end = S - (w0*dx + 0.5*slope*dx*dx);
      // zero in (a,b)?
      if((S>0 && S_end<0) || (S<0 && S_end>0)){
        // solve w0*L + 0.5*slope*L^2 = S
        let L;
        if(Math.abs(slope)<1e-12){
          L = (Math.abs(w0)<1e-12)? 0 : S/w0;
        }else{
          const A=0.5*slope, B=w0, C=-S;
          const disc=B*B-4*A*C;
          L = (-B + Math.sign(slope)*Math.sqrt(Math.max(0,disc)))/(2*A);
        }
        const x0 = clamp(a + L, a, b);
        const M0 = Mcorr(x0);
        if(Math.abs(M0) > Math.abs(best.val)) best = {x:x0, val:M0};
      }
      // advance to just right of b:
      S = S_end;
      // point loads and reactions at b
      for(const p of points) if(Math.abs(p.x-b)<1e-12) S -= p.P;
      for(const r of reacts) if(Math.abs(r.x-b)<1e-12) S += r.R;
    }
    // check ends too
    const Mend = Mcorr(asb.Ltot);
    if(Math.abs(Mend)>Math.abs(best.val)) best={x:asb.Ltot, val:Mend};
    return best; // {x, val}
  }

  
  function shearZeroes(){
    const xs = uniqSort([
      0, ...ends,
      ...udls.flatMap(u => [u.a, u.b]),
      ...points.map(p => p.x)
    ]);

    let S = Vexact(xs[0] + 1e-10);  // shear just to the right of the first event
    const out = [];

    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i+1];
      const dx = b - a;
      if (dx <= 1e-12) continue;

      const eps = 1e-10;
const w0  = wAt(a + eps);                           // right-limit at a
const s   = (wAt(b - eps) - wAt(a + eps)) / (dx || 1); // left-limit at b

      const S_end = S - (w0*dx + 0.5*s*dx*dx);            // shear at right limit of b

      // If sign change in (a,b), solve (1/2 s) L^2 + w0 L - S = 0 for 0<L<dx
      if ((S>0 && S_end<0) || (S<0 && S_end>0)) {
        if (Math.abs(s) < 1e-14) {
          // constant load block
          const L = (Math.abs(w0) < 1e-14) ? 0 : (S / w0);
          const x0 = clamp(a + L, a, b);
          out.push({ x: x0, M: Mcorr(x0) });
        } else {
          const A = 0.5*s, B = w0, C = -S;
          const disc = B*B - 4*A*C;                       // = w0^2 + 2 s S
          if (disc >= -1e-14) {
            const r = Math.sqrt(Math.max(0, disc));
            const L1 = (-B + r) / (2*A);
            const L2 = (-B - r) / (2*A);
            [L1, L2].forEach(L => {
              if (L > -1e-10 && L < dx + 1e-10) {
                const x0 = clamp(a + L, a, b);
                out.push({ x: x0, M: Mcorr(x0) });
              }
            });
          }
        }
      }

      // advance to just-right of b (apply jumps at b)
      S = S_end;
      for (const p of points) if (Math.abs(p.x - b) < 1e-12) S -= p.P;
      for (const r of reacts) if (Math.abs(r.x - b) < 1e-12) S += r.R;
    }

    // de-dup in case both roots hit numerically
    const uniq = Array.from(new Map(out.map(o => [fmt(o.x,9), o])).values());
    return uniq.sort((p,q) => p.x - q.x);
  }
return {Vexact, Mcorr, joints, maxM: maxMomentAbs(), vZeroes: shearZeroes()};
}

// ---------- Evaluate (for probes / joints) ----------
function evalAtX(asb, U, xg){
  const { nodes, nel, E, Ilist, spans, map } = asb;
  const ends=cumEnds(spans);
  // find element containing xg
  let e = 0;
  while(e < nel-1 && !(nodes[e] <= xg && xg <= nodes[e+1])) e++;
  const xL = nodes[e], xR = nodes[e+1], h=xR-xL;
  const s  = Math.max(0, Math.min(1, (xg - xL)/h));
  const dofs=[U[map.vidx[e]],U[map.thR[e]],U[map.vidx[e+1]],U[map.thL[e+1]]];
  const xmid=0.5*(xL+xR);
  let i=0; while(i<spans.length && xmid>ends[i+1]-1e-12) i++;
  const EIe=(E*1e9)*(Ilist[i] ?? Ilist.at(-1));
 const hf = hermiteField(h, EIe, dofs, s);

// If we have the exact VM, override V and M using exact shear and Mcorr.
// exact.Vexact and exact.Mcorr are in kN and kN·m; evalAtX returns N and N·m,
// so convert by ×1e3 to keep downstream displays (÷1000) consistent.
const ex = window.__exact;
if (ex) {
  const Vn = ex.Vexact(xg + 1e-10) * 1e3; // kN → N (right-limit for shear)
  const Mm = ex.Mcorr(xg) * 1e3;         // kN·m → N·m
  return { ...hf, V: Vn, M: Mm };
}

return hf;

}

function evalJointSided(asb,U,xg){
  const eps=1e-10; return {left:evalAtX(asb,U,Math.max(0,xg-eps)), right:evalAtX(asb,U,Math.min(asb.Ltot,xg+eps))};
}

// joint ordinates (we’ll overwrite with exact VM later)
function computeJointOrdinates(asb, U){
  const out=[];
  const nJ = asb.ends.length;
  for(let j=0;j<nJ;j++){
    const xg = (asb.endsSnap ?? asb.ends)[j];
    const side = evalJointSided(asb, U, xg);
    const jt = asb.jointTypes[j];

    const rec = {
      j, x:xg,
      V_L: side.left.V/1e3,  V_R: side.right.V/1e3, // kN
      M_L: side.left.M/1e3,  M_R: side.right.M/1e3, // kN·m
      th_L: side.left.th,    th_R: side.right.th,
      v_mm: side.left.v*1e3,
      isHinge: jt === "HINGE"
    };

    // Clamp end ordinates
    if (j === 0) {               // left end
      rec.V_L = 0;
      rec.M_L = 0;
    }
    if (j === nJ - 1) {          // right end
      rec.V_R = 0;               // <-- always 0 by equilibrium
      rec.M_R = 0;               // keep consistent with your earlier rule
      if (jt === "FIX") rec.th_R = 0; // clamp slope only if fixed
    }

    out.push(rec);
  }
  return out;
}



// ---------- Analytic extrema (exact) ----------
function findDeflectionExtremaExact(asb,U){
  const out=[];
  const {nodes, nel, E, Ilist, spans, map}=asb;
  const ends=cumEnds(spans);
  const spanIndexAtX = (x) => { let i=0; while(i<spans.length && x>ends[i+1]-1e-12) i++; return i; };
  for(let e=0;e<nel;e++){
    const xL=nodes[e], xR=nodes[e+1], h=xR-xL;
    const dofs=[U[map.vidx[e]],U[map.thR[e]],U[map.vidx[e+1]],U[map.thL[e+1]]];
    const xmid=0.5*(xL+xR), sIdx=spanIndexAtX(xmid);
    const EIe=(E*1e9)*(Ilist[sIdx] ?? Ilist.at(-1));

    const v1=dofs[0], t1=dofs[1], v2=dofs[2], t2=dofs[3];
    // θ(s) = A2 s^2 + A1 s + A0
    const A2 = ( 6*v1/h + 3*t1 - 6*v2/h + 3*t2 );
    const A1 = (-6*v1/h - 4*t1 + 6*v2/h - 2*t2 );
    const A0 = t1;

    const roots=[];
    if(Math.abs(A2)<1e-14){
      if(Math.abs(A1)>1e-14){
        const s=-A0/A1; if(s>1e-12 && s<1-1e-12) roots.push(s);
      }
    }else{
      const D=A1*A1-4*A2*A0;
      if(D>=-1e-14){
        const sqrtD=Math.sqrt(Math.max(0,D));
        const s1=(-A1+sqrtD)/(2*A2), s2=(-A1-sqrtD)/(2*A2);
        [s1,s2].forEach(s=>{ if(s>1e-12 && s<1-1e-12) roots.push(s); });
      }
    }
    for(const s of roots){
      const N=hermiteShape(h,s);
      const v = N[0]*v1 + N[1]*t1 + N[2]*v2 + N[3]*t2;
      // classify by curvature sign (M/EI)
      const curv = hermiteField(h,EIe,dofs,s).M / EIe;
      out.push({ x:xL+s*h, v, kind: curv<0?"max":curv>0?"min":"flat" });
    }
  }
  return out.sort((a,b)=>a.x-b.x);
}
function findSlopeExtremaExact(asb,U){
  const out=[];
  const {nodes, nel, E, Ilist, spans, map}=asb;
  const ends=cumEnds(spans);
  const spanIndexAtX = (x) => { let i=0; while(i<spans.length && x>ends[i+1]-1e-12) i++; return i; };
  for(let e=0;e<nel;e++){
    const xL=nodes[e], xR=nodes[e+1], h=xR-xL;
    const dofs=[U[map.vidx[e]],U[map.thR[e]],U[map.vidx[e+1]],U[map.thL[e+1]]];
    const xmid=0.5*(xL+xR), sIdx=spanIndexAtX(xmid);
    const EIe=(E*1e9)*(Ilist[sIdx] ?? Ilist.at(-1));
    // M(s) ~ linear in s → zero where M=0
    // Use curv(s) linear combination of d2N*: d2N1..d2N4 (linear in s)
    const d2N1s = (s)=> (-6+12*s)/(h*h);
    const d2N2s = (s)=> (-4+6*s)/h;
    const d2N3s = (s)=> ( 6-12*s)/(h*h);
    const d2N4s = (s)=> (-2+6*s)/h;
    // coefficients for curv(s) = a*s + b
    const a = (12/(h*h))*dofs[0] + (6/h)*dofs[1] + (-12/(h*h))*dofs[2] + (6/h)*dofs[3];
    const b = (-6/(h*h))*dofs[0] + (-4/h)*dofs[1] + (6/(h*h))*dofs[2] + (-2/h)*dofs[3];
    if(Math.abs(a)>1e-14){
      const s = -b/a;
      if(s>1e-12 && s<1-1e-12){
        const th = hermiteField(h,EIe,dofs,s).th;
        const kind = a>0 ? "min" : "max";
        out.push({x:xL+s*h, val:th, kind});
      }
    }
  }
  return out.sort((a,b)=>a.x-b.x);
}

// ---------- Rendering ----------
function renderAll(asb, sample, loads, jointReactions){
  const {spans, ends, Ltot, jointTypes, Ilist} = asb;
  const w=1000,h=220,pad=40;
  svg.innerHTML="";
  const y0=h/2, scaleX=(w-2*pad)/Ltot;
  const g=svgGroup();
  const tScale=thicknessScale(Ilist);
  for(let s=0;s<spans.length;s++){
    const x1=pad+ends[s]*scaleX, x2=pad+ends[s+1]*scaleX;
    const base=svgPath(`M${x1},${y0}L${x2},${y0}`,"beam");
    base.setAttribute("stroke-width",tScale(Ilist[s])); g.appendChild(base);
  }
  for(let j=0;j<jointTypes.length;j++){
    const xx=pad+(asb.endsSnap?.[j]??ends[j])*scaleX;
    if(jointTypes[j]==="PIN")  g.appendChild(svgPath(trianglePath(xx,y0+4,12,-10),"support"));
    if(jointTypes[j]==="FIX")  g.appendChild(svgPath(`M${xx},${y0-18}L${xx},${y0+18}`,"support"));
    if(jointTypes[j]==="HINGE"){ const hc=document.createElementNS("http://www.w3.org/2000/svg","circle"); hc.setAttribute("cx",xx); hc.setAttribute("cy",y0); hc.setAttribute("r",4); hc.setAttribute("class","support"); g.appendChild(hc); }
    const Rv=jointReactions?.find(r=>r.joint===j&&r.kind==="V")?.val ?? 0;
    const Mv=jointReactions?.find(r=>r.joint===j&&r.kind==="M")?.val ?? 0;
    if(Math.abs(Rv)>1e-8){ const dir=Rv>=0?-1:+1; g.appendChild(pointArrow(xx,y0-22,dir,16,6)); g.appendChild(svgText(`${fmt(Rv/1e3)}`,xx+6,y0-26*dir,"10px")); }
    if(jointTypes[j]==="FIX" && Math.abs(Mv)>1e-8){ g.appendChild(momentCurl(xx-16,y0-26,Mv>=0?+1:-1)); g.appendChild(svgText(`${fmt(Math.abs(Mv/1e3))}`,xx-28,y0-38,"10px")); }
  }
  // loads (sign aware)
  for(const L of loads){
    if(L.kind==="Point"){ const xx=pad+L.xg*scaleX; const isUp=L.PkN<0; const yTop=isUp?(y0+40):(y0-40); const dir=isUp?-1:+1; g.appendChild(pointArrow(xx,yTop,dir)); }
    else if(L.kind==="UDL"){
      const xa=pad+L.xa*scaleX, xb=pad+L.xb*scaleX; const avg=0.5*(L.w1+L.w2); const isUp=avg<0; const yBase=isUp?(y0+40):(y0-40); const kH=12;
      const yA=yBase-Math.abs(L.w1)*kH*0.15, yB=yBase-Math.abs(L.w2)*kH*0.15;
      const poly=document.createElementNS("http://www.w3.org/2000/svg","path");
      poly.setAttribute("d",`M${xa},${yBase}L${xa},${yA}L${xb},${yB}L${xb},${yBase}Z`);
      poly.setAttribute("class","udl"); poly.setAttribute("fill","rgba(90,167,255,0.25)"); g.appendChild(poly);
      for(let xpx=Math.ceil(xa/30)*30; xpx<=xb; xpx+=30) g.appendChild(pointArrow(xpx,yBase,isUp?-1:+1,14,7));
    }else if(L.kind==="Moment"){ const xx=pad+L.xg*scaleX; g.appendChild(momentCurl(xx,y0-28,L.sign>=0?1:-1)); }
  }
  // elastic curve
  const pts=sample.x.map((xi,i)=>`${pad+xi*scaleX},${y0 - sample.v[i]*(50/Math.max(...sample.v.map(Math.abs),1e-10))}`).join(" ");
  const pl=document.createElementNS("http://www.w3.org/2000/svg","polyline");
  pl.setAttribute("points",pts); pl.setAttribute("class","udl"); pl.setAttribute("fill","none"); pl.setAttribute("stroke-width","2"); g.appendChild(pl);
  svg.appendChild(g);
}

function getDiagramWrap(){
  let wrap=document.getElementById("diagramWrap");
  if(!wrap){ wrap=document.createElement("div"); wrap.id="diagramWrap"; const sketchWrap=svg.parentElement; sketchWrap.parentElement.appendChild(wrap); }
  return wrap;
}


function drawDiagrams(asb, field, jointOrds, maxPicks, jointReactions, exactVM){
  const wrap=getDiagramWrap(); wrap.innerHTML="";
  const items=[
    {name:"Shear V (kN)",     data: field.V.map(_=>_/1e3)},
    {name:"Moment M (kN·m)",  data: field.M.map(_=>_/1e3)},
    {name:"Slope θ (rad)",    data: field.th},
    {name:"Deflection δ (mm)",data: field.v.map(_=>_*1e3)},
  ];
  const W=1000,H=150,pad=48,Ltot=asb.Ltot,scaleX=(W-2*pad)/Ltot;

  for(const it of items){
    const s=document.createElementNS("http://www.w3.org/2000/svg","svg");
    s.setAttribute("viewBox",`0 0 ${W} ${H}`); s.setAttribute("class","diag");
    s.style.display="block"; s.style.width="100%"; s.style.height=`${H}px`; s.style.margin="12px 0 20px";
    s.appendChild(svgText(it.name,12,18,"12px"));

    const y0=Math.round(H/2); s.appendChild(svgPath(`M${pad},${y0}L${W-pad},${y0}`,"support"));

    // clean series (do not force pin end values here)
    const raw = it.data.slice();
    const maxAbs = Math.max(1e-12, ...raw.map(v=>Math.abs(v)));
    for (let i=0;i<raw.length;i++) if (Math.abs(raw[i]) < 1e-6*maxAbs) raw[i]=0;

    const kY = (H/2 - 28) / Math.max(1e-12, ...raw.map(v=>Math.abs(v)));
    const pts=field.x.map((xi,i)=>`${pad+xi*scaleX},${y0 - raw[i]*kY}`).join(" ");
    const pl=document.createElementNS("http://www.w3.org/2000/svg","polyline");
    pl.setAttribute("points",pts); pl.setAttribute("class","udl"); pl.setAttribute("fill","none"); pl.setAttribute("stroke-width","2"); s.appendChild(pl);

    // helpers
    const yFrom = val => y0 - val*(H/2-28)/Math.max(1e-12, ...it.data.map(v=>Math.abs(v)));
const showVal = (txt, xx, yy) => {
  const t = svgText(txt, xx, yy, "9px");
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("class", "chart-tick");   // picks up halo + theme color
  return t;
};

const dot = (xx, yy) => {
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", xx);
  c.setAttribute("cy", yy);
  c.setAttribute("r", 3);
  c.setAttribute("fill", "#2563eb");
  c.setAttribute("class", "chart-dot");    // halo outline
  return c;
};

    const CLAMP_PAD=10, clampY=yy=>Math.max(CLAMP_PAD,Math.min(H-CLAMP_PAD,yy));
    const clampTiny=v=>(Math.abs(v)<1e-5?0:v);

    
    // anti-overlap nudge for labels
    const placed=[];
    function placeLabel(xx,yy){
      let x=xx,y=yy,tries=0;
      while(placed.some(p=>Math.abs(p.x-x)<20 && Math.abs(p.y-y)<12) && tries<8){
        y += (tries%2? -1 : +1) * 12;
        x += (tries%3 - 1) * 8;
        tries++;
      }
      placed.push({x,y}); return {x,y};
    }

    // JOINT ORDINATES
    const epsShowTwo=1e-8;
    if(jointOrds) for(const r of jointOrds){
      const xpx=pad+r.x*scaleX; let vL,vR,yL,yR,two=false;
      if(/^Shear/.test(it.name)){
        vL=clampTiny(r.V_L); vR=clampTiny(r.V_R); two=Math.abs(vL-vR)>epsShowTwo; yL=yFrom(vL); yR=yFrom(vR);
// draw a vertical connector at this joint — also at the ends
{
  const endJoint = (r.j === 0 || r.j === jointOrds.length - 1);
  const hasStep  = two || (endJoint && (Math.abs(vL) + Math.abs(vR) > 1e-10));
  if (hasStep) {
    const tick = svgPath(
      `M${xpx},${clampY(Math.min(yL, yR) - 5)}L${xpx},${clampY(Math.max(yL, yR) + 5)}`
    );
    tick.setAttribute("stroke", "#94a3b8");
    tick.setAttribute("stroke-width", "1.5");
    s.appendChild(tick);
  }
}



      } else if(/^Moment/.test(it.name)){ vL=clampTiny(r.M_L); vR=clampTiny(r.M_R); two=Math.abs(vL-vR)>epsShowTwo; yL=yFrom(vL); yR=yFrom(vR);
// draw a vertical connector at this joint — also at the ends
{
  const endJoint = (r.j === 0 || r.j === jointOrds.length - 1);
  const hasStep  = two || (endJoint && (Math.abs(vL) + Math.abs(vR) > 1e-4));
  if (hasStep) {
    const tick = svgPath(
      `M${xpx},${clampY(Math.min(yL, yR) - 5)}L${xpx},${clampY(Math.max(yL, yR) + 5)}`
    );
    tick.setAttribute("stroke", "#94a3b8");
    tick.setAttribute("stroke-width", "1.5");
    s.appendChild(tick);
  }
}
      } else if(/^Slope/.test(it.name)){ vL=r.th_L; vR=r.th_R; two=r.isHinge||Math.abs(vL-vR)>epsShowTwo; yL=yFrom(vL); yR=yFrom(vR);
      } else if(/^Deflection/.test(it.name)){ vL=clampTiny(r.v_mm); two=false; yL=yFrom(vL);
      } else continue;

      if(/^Shear/.test(it.name) || /^Moment/.test(it.name) || /^Slope/.test(it.name)){
        if(two){
          s.appendChild(dot(xpx-7,yL)); {const p=placeLabel(xpx-7,clampY(yL-6)); s.appendChild(showVal(fmt(vL),p.x,p.y));} s.appendChild(svgText("L",xpx-9,clampY(yL+12),"8px"));
          s.appendChild(dot(xpx+9,yR)); {const p=placeLabel(xpx+9,clampY(yR-6)); s.appendChild(showVal(fmt(vR),p.x,p.y));} s.appendChild(svgText("R",xpx+13,clampY(yR+12),"8px"));
        }else{
          s.appendChild(dot(xpx,yL)); const p=placeLabel(xpx,clampY(yL-8)); s.appendChild(showVal(fmt(vL),p.x,p.y));
        }
      } else if(/^Deflection/.test(it.name)){
        s.appendChild(dot(xpx,yL)); const p=placeLabel(xpx,clampY(yL-8)); s.appendChild(showVal(fmt(vL),p.x,p.y));
      }
    }

    // LOAD/MOMENT ORDINATES
    try {
      const { points: ptLoads, moments: ptMoms } = parseLoadsFull(asb.spans, asb.endsSnap ?? asb.ends);
if (/^Shear/.test(it.name)) {
  // (existing) compute vL, vR, two, yL, yR
  vL = clampTiny(r.V_L); 
  vR = clampTiny(r.V_R); 
  two = Math.abs(vL - vR) > epsShowTwo; 
  yL = yFrom(vL); 
  yR = yFrom(vR);

  
const endJoint = (r.j === 0 || r.j === jointOrds.length - 1);
const hasStep  = two || (endJoint && (Math.abs(vL) + Math.abs(vR) > 1e-4));
if (hasStep) {
  const tick = svgPath(
    `M${xpx},${clampY(Math.min(yL, yR) - 5)}L${xpx},${clampY(Math.max(yL, yR) + 5)}`
  );
  tick.setAttribute("stroke", "#94a3b8");
  tick.setAttribute("stroke-width", "1.5");
  s.appendChild(tick);
}
        for (const m of ptMoms) {
          if (Math.abs(m.x - asb.Ltot) < 1e-4) continue;
          const xpx = pad + m.x * scaleX;
          const V = clampTiny(exactVM.Vexact(m.x + 1e-4));
          const y = yFrom(V);
          s.appendChild(dot(xpx, clampY(y)));
          const pT = placeLabel(xpx, clampY(y - 8)); s.appendChild(showVal(fmt(V), pT.x, pT.y));
        }
      }
      if (/^Moment/.test(it.name)) {
        for (const m of ptMoms) {
          const xpx = pad + m.x * scaleX;
          const ML = clampTiny(exactVM.Mcorr(m.x - 1e-10)); // left
          const MR = clampTiny(exactVM.Mcorr(m.x + 1e-10)); // right
          const yL = yFrom(ML), yR = yFrom(MR);
          const tick = svgPath(`M${xpx},${clampY(Math.min(yL,yR)-5)}L${xpx},${clampY(Math.max(yL,yR)+5)}`);
          tick.setAttribute("stroke","#94a3b8"); tick.setAttribute("stroke-width","1.5");
          s.appendChild(tick);
          s.appendChild(dot(xpx, clampY(yL))); {const pL=placeLabel(xpx-14, clampY(yL-8)); s.appendChild(showVal(fmt(ML), pL.x, pL.y));}
          s.appendChild(dot(xpx, clampY(yR))); {const pR=placeLabel(xpx+14, clampY(yR-8)); s.appendChild(showVal(fmt(MR), pR.x, pR.y));}
        }
        for (const p of ptLoads) {
          const xpx = pad + p.x * scaleX;
          const M = clampTiny(exactVM.Mcorr(p.x)); // continuous
          const y = yFrom(M);
          s.appendChild(dot(xpx, clampY(y)));
          const pT=placeLabel(xpx, clampY(y - 8)); s.appendChild(showVal(fmt(M), pT.x, pT.y));
        }
      }
    } catch(e) { console.warn("Load/moment ordinates annotation failed", e); }

    // Shear=0 guides: dashed only on Shear; on Moment plot show only dot+label
    try {
      if (/^Shear/.test(it.name) && Array.isArray(exactVM?.vZeroes)) {
        for (const z of exactVM.vZeroes) {
          const xpx = pad + z.x * scaleX;
          const gline = svgPath(`M${xpx},${20}L${xpx},${H-20}`);
          gline.setAttribute("stroke","#94a3b8"); gline.setAttribute("stroke-dasharray","6 6"); gline.setAttribute("opacity","0.6");
          s.appendChild(gline);
          const pX = placeLabel(xpx, 12); s.appendChild(showVal(`x=${fmt(z.x,3)}`, pX.x, pX.y));
        }
      }
// diamond + label helpers (must be defined before we call them)
const diamond = (xx, yy, r = 5, stroke = "#059669") => {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const d = `M${xx},${yy-r} L${xx+r},${yy} L${xx},${yy+r} L${xx-r},${yy} Z`;

  // halo underlay
  const h = document.createElementNS("http://www.w3.org/2000/svg", "path");
  h.setAttribute("d", d);
  h.setAttribute("class", "peak-diamond-halo");
  g.appendChild(h);

  // colored stroke on top
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  p.setAttribute("class", "peak-diamond");
  p.setAttribute("stroke", stroke);
  g.appendChild(p);

  return g;
};

const peakLabel = (txt, xx, yy, col = "#16a34a") => {
  const t = svgText(txt, xx, yy, "10px");
  t.setAttribute("fill", col);                 // keep color semantics (max/min)
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("class", "peak-label");       // adds halo
  return t;
};


 // Moment labels at V=0 (use corrected value = Mexact(x) - 2 * M_left)
// Analytical moment extrema from shear zeroes (Mcorr), mark ALL with diamonds
if (/^Moment/.test(it.name) && exactVM && Array.isArray(exactVM.vZeroes)) {
  const eps = 1e-6;
  const extrema = [];

  for (const z of exactVM.vZeroes) {
    const Mz = exactVM.Mcorr(z.x);            // kN·m (corrected!)
    const dV = exactVM.Vexact(z.x + eps) - exactVM.Vexact(z.x - eps);
    const kind = dV < 0 ? "max" : dV > 0 ? "min" : "ext";
    extrema.push({ x: z.x, val: Mz, kind });
  }

  // de-dup and draw
  const uniq = [...new Map(extrema.map(e => [e.x.toFixed(9), e])).values()]
               .sort((a,b)=>a.x-b.x);

  for (const e of uniq) {
    const xpx = pad + e.x * scaleX;
    const ypx = yFrom(clampTiny(e.val));
    const col = e.kind === "max" ? "#f59e0b" :
                e.kind === "min" ? "#60a5fa" : "#a3a3a3";
    s.appendChild(diamond(xpx, ypx, 5, col));
    s.appendChild(peakLabel(`${e.kind} ${fmt(e.val)} kN·m`, xpx, clampY(ypx - 12), col));
  }
}



    } catch(e) { console.warn("V=0 guides failed", e); }

    // diamonds + labels (preserve your existing markers)
const diamond = (xx, yy, r = 5, stroke = "#059669") => {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const d = `M${xx},${yy-r} L${xx+r},${yy} L${xx},${yy+r} L${xx-r},${yy} Z`;

  // halo underlay
  const h = document.createElementNS("http://www.w3.org/2000/svg", "path");
  h.setAttribute("d", d);
  h.setAttribute("class", "peak-diamond-halo");
  g.appendChild(h);

  // colored stroke on top
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  p.setAttribute("class", "peak-diamond");
  p.setAttribute("stroke", stroke);
  g.appendChild(p);

  return g;
};

const peakLabel = (txt, xx, yy, col = "#16a34a") => {
  const t = svgText(txt, xx, yy, "10px");
  t.setAttribute("fill", col);                 // keep color semantics (max/min)
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("class", "peak-label");       // adds halo
  return t;
};


if (/^Slope/.test(it.name) && maxPicks) {
  // draw the global |θ|max first
  const drawn = [];
  if (maxPicks.th && isFinite(maxPicks.th.x) && isFinite(maxPicks.th.val)) {
    const x = maxPicks.th.x, y = maxPicks.th.val;
    const xpx = pad + x * scaleX, ypx = yFrom(y);
    s.appendChild(diamond(xpx, ypx));
    s.appendChild(peakLabel(`|θ|max ${fmt(Math.abs(y))}`, xpx, clampY(ypx - 12)));
    drawn.push({ x, y });
  }

  // sign gating: only show "max" if θ>0 exists; only show "min" if θ<0 exists
  const hasPos = (it.data || []).some(v => v > +1e-6);
  const hasNeg = (it.data || []).some(v => v < -1e-6);

  // pixel-based de-dupe vs |θ|max and vs other locals
  const pxTol  = 8;                                 // ~8 px considered the same x
  const xTol   = pxTol / Math.max(scaleX, 1e-9);    // convert pixels → world-x
  const yTol   = 1e-9;

  const src = Array.isArray(maxPicks.thExtrema) ? maxPicks.thExtrema : [];
  const buckets = new Map(); // key by pixel bucket, keep the larger |val|

  for (const e of src) {
    if (!isFinite(e?.x) || !isFinite(e?.val)) continue;
    if (e.kind === "max" && !hasPos) continue;
    if (e.kind === "min" && !hasNeg) continue;

    // skip if it coincides with the already-drawn global |θ|max
    if (drawn.some(p => Math.abs(p.x - e.x) <= xTol && Math.abs(p.y - e.val) <= yTol)) continue;

    const xpx = pad + e.x * scaleX;
    const key = Math.round(xpx / pxTol); // bucket by pixels
    const prev = buckets.get(key);
    if (!prev || Math.abs(e.val) > Math.abs(prev.val)) {
      buckets.set(key, { ...e, xpx });
    }
  }

  for (const e of buckets.values()) {
    const xx = pad + e.x * scaleX;
    const yy = yFrom(e.val);
    const col = e.kind === "max" ? "#f59e0b" : e.kind === "min" ? "#60a5fa" : "#a3a3a3";
    s.appendChild(diamond(xx, yy, 4, col));
    s.appendChild(peakLabel(`${e.kind} ${fmt(e.val)}`, xx, clampY(yy + 14), col));
  }
}


if (/^Deflection/.test(it.name)) {
  // 1) global |δ|max (already computed in mm in your maxPicks)
  const xAbs = maxPicks?.d?.x, vAbs = maxPicks?.d?.val; // mm
  if (isFinite(xAbs) && isFinite(vAbs)) {
    const xpx = pad + xAbs * scaleX, ypx = yFrom(vAbs);
    s.appendChild(diamond(xpx, ypx));
    s.appendChild(peakLabel(`|δ|max ${fmt(Math.abs(vAbs))} mm`, xpx, clampY(ypx - 12)));
  }

  // 2) local extrema from θ(x)=0 roots (analytical/FEA-hybrid)
  //    – you already compute these for the cards; use the same list here
  //    – values in mm; kind is "max" or "min"
  let dExt = [];
  try {
    dExt = (typeof findDeflectionExtremaExact === "function")
      ? findDeflectionExtremaExact(asb, U)  // returns [{x, v_mm, kind}, ...]
      : (maxPicks?.dExtrema || []);         // fallback: whatever you had
  } catch { dExt = maxPicks?.dExtrema || []; }

  // 3) remove duplicates/near-joint points and enforce sign gating
  const ends = cumEnds(parseSpans()); // same helper you use elsewhere
  const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
  const isJoint = (x) => ends.some(e => near(e, x, 1e-8));

  // actual sign presence in the plotted deflection array (mm)
  const hasPos = (it.data || []).some(v => v > +1e-6);
  const hasNeg = (it.data || []).some(v => v < -1e-6);

  const filtered = [];
  for (const e of dExt) {
    if (!isFinite(e?.x) || !isFinite(e?.v_mm)) continue;
    if (isJoint(e.x)) continue; // δ is clamped at joints; don't label there
    if (e.kind === "max" && !hasPos) continue;
    if (e.kind === "min" && !hasNeg) continue;

    // de-dupe: keep the stronger one if very close in x
    const clash = filtered.find(p => near(p.x, e.x, 1e-5));
    if (!clash) filtered.push({ x: e.x, v_mm: e.v_mm, kind: e.kind });
    else if (Math.abs(e.v_mm) > Math.abs(clash.v_mm)) {
      clash.v_mm = e.v_mm; clash.kind = e.kind;
    }
  }

  // 4) draw the diamonds + labels
  for (const e of filtered) {
    const xx = pad + e.x * scaleX;
    const yy = yFrom(e.v_mm);
    const col = e.kind === "max" ? "#f59e0b" : "#60a5fa";
    s.appendChild(diamond(xx, yy, 4, col));
    s.appendChild(peakLabel(`${e.kind} ${fmt(e.v_mm)} mm`, xx, clampY(yy + 14), col));
  }
}




    wrap.appendChild(s);
  }
}


// ---------- Preview ----------
function rebuildJointSupportPanel(){
  let panel=document.getElementById("jointSupportPanel");
  if(panel) panel.remove();
  const spans=parseSpans(); if(!spans.length) return;
  const firstPanel=document.querySelectorAll(".panel")[0];
  panel=document.createElement("section"); panel.className="panel"; panel.id="jointSupportPanel";
  panel.innerHTML=`<h2>Joint Supports</h2>
    <p class="muted">Set support at each joint (0…${spans.length}). Joint 1 is between span 1 and 2.</p>
    <div id="supportGrid" class="grid"></div>`;
  firstPanel.after(panel);
  const grid=panel.querySelector("#supportGrid");
  for(let j=0;j<spans.length+1;j++){
    const label=document.createElement("label");
    label.innerHTML=`Joint ${j}
      <select data-joint="${j}" class="joint-support">
        <option value="NONE">None</option>
        <option value="PIN">Pin (v=0)</option>
        <option value="FIX">Fixed (v=0, θ=0)</option>
        <option value="HINGE">Internal Hinge (v cont., θ release)</option>
      </select>`;
    grid.appendChild(label);
  }
  grid.querySelector('select[data-joint="0"]').value="PIN";
  grid.querySelector(`select[data-joint="${spans.length}"]`).value="PIN";
  for(let j=1;j<spans.length;j++) grid.querySelector(`select[data-joint="${j}"]`).value="NONE";
  grid.addEventListener("change",drawPreview,true);
  grid.addEventListener("input",drawPreview,true);
}
function getJointSupports(spans){
  const types=[]; for(let j=0;j<spans.length+1;j++){ const sel=document.querySelector(`.joint-support[data-joint="${j}"]`); types.push(sel?sel.value:"NONE"); }
  return types;
}
function currentJointTypes(){
  const spans=parseSpans(); if(!spans.length) return [];
  if(!document.getElementById("jointSupportPanel")) rebuildJointSupportPanel();
  return getJointSupports(spans);
}
function drawPreview(){
  const spans=parseSpans(); if(!spans.length){ svg.innerHTML=""; return; }
  const ends=cumEnds(spans); const Ilist=parseIList(spans); const jointTypes=currentJointTypes(); const loads=currentLoadsForDrawing(spans, ends);
  const w=1000,h=220,pad=40, y0=h/2, Ltot=ends.at(-1)||1, scaleX=(w-2*pad)/Ltot;
  svg.innerHTML=""; const g=svgGroup();
  const tScale=thicknessScale(Ilist);
  for(let s=0;s<spans.length;s++){ const x1=pad+ends[s]*scaleX, x2=pad+ends[s+1]*scaleX; const base=svgPath(`M${x1},${y0}L${x2},${y0}`,"beam"); base.setAttribute("stroke-width",tScale(Ilist[s])); g.appendChild(base); }
  for(let j=0;j<jointTypes.length;j++){
    const xx=pad+ends[j]*scaleX;
    if(jointTypes[j]==="PIN")  g.appendChild(svgPath(trianglePath(xx,y0+4,12,-10),"support"));
    if(jointTypes[j]==="FIX")  g.appendChild(svgPath(`M${xx},${y0-18}L${xx},${y0+18}`,"support"));
    if(jointTypes[j]==="HINGE"){ const hc=document.createElementNS("http://www.w3.org/2000/svg","circle"); hc.setAttribute("cx",xx); hc.setAttribute("cy",y0); hc.setAttribute("r",4); hc.setAttribute("class","support"); g.appendChild(hc); }
  }
  for(const L of loads){
    if(L.kind==="Point"){ const xx=pad+L.xg*scaleX; const isUp=L.PkN<0; const yTop=isUp?(y0+40):(y0-40); const dir=isUp?-1:+1; g.appendChild(pointArrow(xx,yTop,dir)); }
    else if(L.kind==="UDL"){
      const xa=pad+L.xa*scaleX, xb=pad+L.xb*scaleX; const avg=0.5*(L.w1+L.w2); const isUp=avg<0; const yBase=isUp?(y0+40):(y0-40); const kH=12;
      const yA=yBase-Math.abs(L.w1)*kH*0.15, yB=yBase-Math.abs(L.w2)*kH*0.15;
      const poly=document.createElementNS("http://www.w3.org/2000/svg","path");
      poly.setAttribute("d",`M${xa},${yBase}L${xa},${yA}L${xb},${yB}L${xb},${yBase}Z`);
      poly.setAttribute("class","udl"); poly.setAttribute("fill","rgba(90,167,255,0.25)"); g.appendChild(poly);
      for(let xpx=Math.ceil(xa/30)*30; xpx<=xb; xpx+=30) g.appendChild(pointArrow(xpx,yBase,isUp?-1:+1,14,7));
    }else if(L.kind==="Moment"){ const xx=pad+L.xg*scaleX; g.appendChild(momentCurl(xx,y0-28,L.sign>=0?1:-1)); }
  }
  svg.appendChild(g);
}

// ---------- CSV ----------
function downloadCSV(){
  const b=window.__beam; if(!b){ alert("Compute first."); return; }
  let csv="x(m),V(N),M(Nm),deflection(m)\n";
  for(let i=0;i<b.x.length;i++) csv+=`${b.x[i]},${b.V[i]},${b.M[i]},${b.d[i]}\n`;
  const blob=new Blob([csv],{type:"text/csv"}); const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download="beam_results.csv"; a.click(); URL.revokeObjectURL(a.href);
}
function reactionAtDOF(Rarr, restrained, dof){ const i=restrained.indexOf(dof); return i>=0?Rarr[i]:0; }
function exactCols(show){ $$(".exact-col").forEach(el=>el.hidden=!show); }

// ---------- Solve ----------
function solve(){
  const vmCardTitle = Array.from(document.querySelectorAll(".card h3")).find(h=>/Max \|M\|/.test(h.textContent||""));
  if (vmCardTitle) vmCardTitle.parentElement.style.display="none";

  const spans=parseSpans(), E=parseFloat(EEl.value);
  const Ilist=parseIList(spans);
  const nel=Math.max(80, Math.min(3000, parseInt(nelEl.value||"240",10)));
  if(!spans.length||!(E>0)||!Ilist.every(v=>v>0)){ alert("Please enter valid spans, E, and I."); return; }

  if(!document.getElementById("jointSupportPanel")) rebuildJointSupportPanel();
  const jointTypes=getJointSupports(spans);

  const asb=assemble(spans,E,Ilist,nel,jointTypes);
  const {U,R}=solveSystem(asb.K,asb.F,asb.restrained);
  window.__asb=asb; window.__U=U;

  const field=buildFields(asb,U,12);

  // reactions → per joint
  const jointReactions=[];
  for(let j=0;j<asb.jointTypes.length;j++){
    const node=asb.map.jointNode[j];
    if(asb.jointTypes[j]==="PIN"||asb.jointTypes[j]==="FIX")
      jointReactions.push({joint:j,kind:"V",val:reactionAtDOF(R,asb.restrained,asb.map.vidx[node])});
    if(asb.jointTypes[j]==="FIX"){
      let Mv=0;
      if(j===0) Mv = reactionAtDOF(R,asb.restrained,asb.map.thR[node]);
      else if (j===asb.jointTypes.length-1) Mv = reactionAtDOF(R,asb.restrained,asb.map.thL[node]);
      else Mv = reactionAtDOF(R,asb.restrained,asb.map.thL[node]) + reactionAtDOF(R,asb.restrained,asb.map.thR[node]);
      jointReactions.push({joint:j,kind:"M",val:Mv});
    }
  }

  // sketch & loads
  const loadsDraw=currentLoadsForDrawing(spans, asb.ends);
  renderAll(asb, field, loadsDraw, jointReactions);
  window.__reactions=jointReactions;

  // exact VM post-processor
  const exact = buildVMExact(asb, jointReactions);
  window.__exact = exact;

  
const nJ = asb.jointTypes.length;
const jointOrds = computeJointOrdinates(asb, U).map(rec => {
  const x = rec.x, eps = 1e-10;
  const jt = asb.jointTypes[rec.j];

  const out = {
    ...rec,
    jt,
    V_L: exact.Vexact(x - eps),  // kN
    V_R: exact.Vexact(x + eps),  // kN
    // keep M from Eval@x (which you've already wired to use Mcorr inside evalAtX)
    M_L: rec.M_L,
    M_R: rec.M_R
  };

  // deflection = 0 at PIN/FIX (mm)
  if (jt === "PIN" || jt === "FIX") out.v_mm = 0;

  // slope = 0 at FIX (both faces at the support label level)
  if (jt === "FIX") { out.th_L = 0; out.th_R = 0; }

  // clamp outside faces at beam ends
  if (rec.j === 0)          { out.V_L = 0; out.M_L = 0; }
  if (rec.j === nJ - 1)     { out.V_R = 0; out.M_R = 0; }

  return out;
});






  // exact analytic extrema
  const dExt = findDeflectionExtremaExact(asb,U);
  const thExt = findSlopeExtremaExact(asb,U);

// candidates: interior θ=0 + all joints (use exact 0 at supports from step #1)
const deflCandidates = [
  ...dExt.map(e => ({ x:e.x, val:e.v })),            // meters
  ...jointOrds.map(r => ({ x:r.x,  val:r.v_mm/1e3 })), // meters
  { x:field.x[0], val:field.v[0] },
  { x:field.x.at(-1), val:field.v.at(-1) }
];

const dPick = deflCandidates.reduce(
  (a,b)=> Math.abs(b.val) > Math.abs(a.val) ? b : a,
  deflCandidates[0]
);


// FEA |M|max from the same curve we plot (field.M is N·m → convert to kN·m)
let im = 0, a = Math.abs(field.M[0]);
for (let i = 1; i < field.M.length; i++) {
  const ai = Math.abs(field.M[i]);
  if (ai > a) { a = ai; im = i; }
}
const Mpick = { x: field.x[im], val: field.M[im] / 1e3 }; // kN·m

// Local extrema of FE Moment (sampled polyline)
function momentLocalExtremaFE(xs, MsNmm){
  const Ms = MsNmm.map(m => m/1e3);       // kN·m
  const exts = [];
  for (let i = 1; i < Ms.length - 1; i++){
    const d1 = Ms[i] - Ms[i-1];
    const d2 = Ms[i+1] - Ms[i];
    if (d1 > 0 && d2 < 0) exts.push({ x: xs[i], val: Ms[i], kind: "M+max" });
    if (d1 < 0 && d2 > 0) exts.push({ x: xs[i], val: Ms[i], kind: "M−min" });
  }
  const pos = exts.filter(e => e.val > 0).sort((a,b)=>b.val - a.val)[0] || null;
  const neg = exts.filter(e => e.val < 0).sort((a,b)=>a.val - b.val)[0] || null;
  return { pos, neg, all: exts };
}
const Mloc = momentLocalExtremaFE(field.x, field.M);


  // exact |θ|max from analytic (fallback to sample)
// candidates: interior roots (M=0) + joint left/right
const slopeCandidates = [
  ...thExt.map(e => ({ x:e.x, val:e.val })),
  ...jointOrds.flatMap(r => ([
    { x: r.x - 1e-12, val: r.th_L },
    { x: r.x + 1e-12, val: r.th_R }
  ]))
];
// fallback endpoints just in case
slopeCandidates.push({x:field.x[0], val:field.th[0]}, {x:field.x.at(-1), val:field.th.at(-1)});

const thPick = slopeCandidates.reduce(
  (a,b)=> Math.abs(b.val) > Math.abs(a.val) ? b : a,
  {x:field.x[0], val:field.th[0]}
);


  const maxPicks={
    M:{x:Mpick.x, val:Mpick.val},                 // kN·m (FEA)
  Mpos: Mloc.pos,                               // local +max (kN·m) or null
  Mneg: Mloc.neg,                               // local −min (kN·m) or null                 // kN·m
    th:{x:thPick.x, val:thPick.val},              // rad
    d:{x:dPick.x, val:dPick.val*1e3},               // mm
    dExtrema: dExt.map(e=>({x:e.x,val:e.v*1e3,kind:e.kind})),
    thExtrema: thExt.map(e=>({x:e.x,val:e.val,kind:e.kind}))
  };

  drawDiagrams(asb, field, jointOrds, maxPicks, jointReactions, exact);

  // cards (use exact |δ|max)
$("#Dmax").textContent = `${fmt(Math.abs(dPick.val*1e3))} @ x=${fmt(dPick.x)}`;


  // reactions (cards)
  const jLeft=0, jRight=asb.jointTypes.length-1;
  const VleftN = jointReactions.find(r=>r.joint===jLeft&&r.kind==="V")?.val ?? 0;
  const VrightN= jointReactions.find(r=>r.joint===jRight&&r.kind==="V")?.val ?? 0;
  const leftType=asb.jointTypes[0], rightType=asb.jointTypes.at(-1);

  const MleftNm  = (leftType==="FIX")  ? (jointReactions.find(r=>r.joint===jLeft && r.kind==="M")?.val ?? 0) : 0;
  const MrightNm = (rightType==="FIX") ? (jointReactions.find(r=>r.joint===jRight&& r.kind==="M")?.val ?? 0) : 0;

  $("#Rleft").textContent  = fmt((leftType==="PIN"||leftType==="FIX")? VleftN/1e3 : 0);
  $("#Mleft").textContent  = `${fmt(Math.abs(MleftNm/1e3))} ${MleftNm>=0?"CCW":"CW"}`;
  $("#Rright").textContent = fmt((rightType==="PIN"||rightType==="FIX")? VrightN/1e3 : 0);
  $("#Mright").textContent = `${fmt(Math.abs(MrightNm/1e3))} ${MrightNm>=0?"CCW":"CW"}`;

  fillProbes(asb,U);
  exactCols(!!exactBox.checked);
  if(exactBox.checked){
    const rL=approxFraction((VleftN/1e3)), mL=approxFraction((MleftNm/1e3));
    const rR=approxFraction((VrightN/1e3)), mR=approxFraction((MrightNm/1e3));
    $("#RleftExact").hidden=false; $("#RrightExact").hidden=false;
    $("#RleftExact").textContent = `R: ${rL ?? "—"} , M: ${mL ?? "—"}`;
    $("#RrightExact").textContent= `R: ${rR ?? "—"} , M: ${mR ?? "—"}`;
  }else{ $("#RleftExact").hidden=true; $("#RrightExact").hidden=true; }

  window.__beam={x:field.x,V:field.V,M:field.M,d:field.v};
  $("#results").hidden=false;
}

// ---------- Probes ----------
function fillProbes(asb,U){
  const tbody=$("#probeTable tbody"); if(!tbody) return;
  tbody.innerHTML="";
  const spans=asb.spans, ends=asb.ends;
  $$("#probes .load-row").forEach(row=>{
    const spanIdx=parseInt(row.querySelector('select[name="spanIdx"]').value,10);
    const Lspan=spans[spanIdx]??0, x0=ends[spanIdx];
    const xloc=parseFloat(row.querySelector('[name="x"]').value||"0");
    const xg=x0+clamp(xloc,0,Lspan);
    const f=evalAtX(asb,U,xg);
    // node-aware exact V/M if exactly on a joint
    let Vdisp=f.V/1e3, Mdisp=f.M/1e3;
    let jNear=-1; for(let j=0;j<ends.length;j++) if(Math.abs(ends[j]-xg)<1e-10){ jNear=j; break; }
    if (jNear >= 0 && Array.isArray(window.__reactions)) {
  const Vrec = window.__reactions.find(r => r.joint === jNear && r.kind === "V")?.val || 0;
  const Mrec = window.__reactions.find(r => r.joint === jNear && r.kind === "M")?.val || 0;
  if (jNear === 0) Vdisp = (Vrec/1e3);
  else if (jNear === ends.length - 1) Vdisp = -(Vrec/1e3);

  const jt = asb.jointTypes[jNear];
  if (jt === "HINGE") {
    Mdisp = 0;
  } else if (jt === "FIX") {
    Mdisp = (Mrec/1e3);
  } else if ((jNear === 0 || jNear === ends.length-1) && (jt === "PIN" || jt === "NONE")) {
    Mdisp = 0; // boundary pin/free
  } // otherwise, leave FE/Exact value
}
    const tr=document.createElement("tr");
    tr.innerHTML=`<td style="text-align:center">${spanIdx+1}</td>
      <td>${fmt(xloc)}</td>
      <td>${fmt(Vdisp)}</td>
      <td>${fmt(Mdisp)}</td>
      <td>${fmt(f.th)}</td>
      <td>${fmt(f.v*1e3)}</td>`;
    if(exactBox.checked){
      const Vfrac=approxFraction(Vdisp), Mfrac=approxFraction(Mdisp), thF=approxFraction(f.th), vF=approxFraction(f.v*1e3);
      const tdV=document.createElement("td"); tdV.className="exact-col"; tdV.textContent=Vfrac ?? "—";
      const tdM=document.createElement("td"); tdM.className="exact-col"; tdM.textContent=Mfrac ?? "—";
      const tdT=document.createElement("td"); tdT.className="exact-col"; tdT.textContent=thF ?? "—";
      const tdD=document.createElement("td"); tdD.className="exact-col"; tdD.textContent=vF ?? "—";
      tr.appendChild(tdV); tr.appendChild(tdM); tr.appendChild(tdT); tr.appendChild(tdD);
    }
    tbody.appendChild(tr);
  });
}


// ---------- live listeners ----------
["loads","probes"].forEach(id=>{
  const box=document.getElementById(id); if(!box) return;
  const handler=()=>{ drawPreview(); if(window.__asb&&window.__U){ try{ fillProbes(window.__asb,window.__U); }catch{} } };
  box.addEventListener("input",handler,true);
  box.addEventListener("change",handler,true);
  new MutationObserver(handler).observe(box,{childList:true,subtree:true});
});

// ---------- boot ----------
rebuildJointSupportPanel();
ensureLoadSpanSelectors();
ensureProbeSpanSelectors();
(function(){ $("#addUDL")?.click(); $("#addProbe")?.click(); drawPreview(); })();
