// Beam Deflection Lite — Multi-Span FEA
// Exact internal hinge (θ split L/R), span-wise I, fractions via math.js
// Conventions: Downward P, w > 0; Point moment CCW > 0.

const $  = (q)=>document.querySelector(q);
const $$ = (q)=>Array.from(document.querySelectorAll(q));

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
  drawPreview(); // keep preview visible after reset
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
    if (Math.abs(f.d) > 1e6) return null; // guard noisy floats
    return `${f.n}/${f.d}`;
  } catch { return null; }
};

// ---------- spans / joints / inertia ----------
function parseSpans(){ return spansEl.value.split(/[,+]/).map(s=>parseFloat(s.trim())).filter(x=>x>0); }
function cumEnds(spans){ const a=[0]; for(const L of spans) a.push(a.at(-1)+L); return a; }
function parseIList(spans){
  const raw = IEl.value.split(/[,+]/).map(s=>s.trim()).filter(s=>s.length>0);
  const vals = raw.map(v=>parseFloat(v)).filter(v=>v>0);
  if (!vals.length) return spans.map(()=>parseFloat(IEl.value)||0);
  if (vals.length===1) return spans.map(()=>vals[0]);
  const arr = [];
  for (let i=0;i<spans.length;i++) arr.push(vals[i] ?? vals.at(-1));
  return arr;
}

// (NEW) thickness scaler from span-wise I (shared by preview & final)
function thicknessScale(Ilist){
  const Ipos = Ilist.map(v => Math.max(v, 1e-12));
  const Imed = Ipos.slice().sort((a,b)=>a-b)[Math.floor(Ipos.length/2)];
  return v => Math.max(4, Math.min(14, 8 * Math.cbrt(Math.max(v,1e-12) / Imed)));
}

function rebuildJointSupportPanel(){
  let panel = document.getElementById("jointSupportPanel");
  if (panel) panel.remove();
  const spans = parseSpans(); if (!spans.length) return;
  const firstPanel = document.querySelectorAll(".panel")[0];
  panel = document.createElement("section");
  panel.className="panel"; panel.id="jointSupportPanel";
  panel.innerHTML = `<h2>Joint Supports</h2>
    <p class="muted">Set support at each joint (0…${spans.length}). Joint 1 is between span 1 and 2.</p>
    <div id="supportGrid" class="grid"></div>`;
  firstPanel.after(panel);
  const grid = panel.querySelector("#supportGrid");
  for (let j=0;j<spans.length+1;j++){
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
  // sensible defaults
  grid.querySelector('select[data-joint="0"]').value = "PIN";
  grid.querySelector(`select[data-joint="${spans.length}"]`).value = "PIN";
  for (let j=1;j<spans.length;j++) grid.querySelector(`select[data-joint="${j}"]`).value="NONE";

  // rebind preview updates when supports change
  grid.addEventListener("change", drawPreview, true);
  grid.addEventListener("input", drawPreview, true);
}
function getJointSupports(spans){
  const types=[]; for(let j=0;j<spans.length+1;j++){ const sel=document.querySelector(`.joint-support[data-joint="${j}"]`); types.push(sel?sel.value:"NONE"); }
  return types;
}

// ---------- DOF mapping with split rotations at internal hinges ----------
/*
 Each mesh node i has:
   v[i]  : shared vertical displacement
   θL[i] : rotation used by the element to the RIGHT's left end
   θR[i] : rotation used by the element to the LEFT's right end
 For non-hinge joints, θL[i] === θR[i]; for hinges, they are distinct DOFs.
*/
function buildDofMap(nel, Ltot, ends, jointTypes){
  const nn = nel + 1;
  const jointNode = ends.map(x => Math.round((x / Ltot) * nel));

  const hingeAtNode = new Array(nn).fill(false);
  for (let j = 1; j < jointTypes.length - 1; j++) {
    const n = jointNode[j];
    if (jointTypes[j] === "HINGE") hingeAtNode[n] = true;
  }

  let next = 0;
  const vidx = new Array(nn);
  const thL  = new Array(nn);
  const thR  = new Array(nn);

  for (let i=0;i<nn;i++) vidx[i] = next++;

  for (let i=0;i<nn;i++){
    if (hingeAtNode[i]) {
      thL[i] = next++;
      thR[i] = next++;
    } else {
      const id = next++;
      thL[i] = id;
      thR[i] = id;
    }
  }
  return { vidx, thL, thR, ndof: next, jointNode, hingeAtNode };
}

// ---------- Assembly with span-wise I ----------
function assemble(spans, E, Ilist, nelTotal, jointTypes){
  const Ltot = spans.reduce((a,b)=>a+b,0), nel = nelTotal, nn = nel+1;
  const ends = cumEnds(spans), h = Ltot/nel;

  // DOF map with exact hinge behavior
  const map = buildDofMap(nel, Ltot, ends, jointTypes);
  const ndof = map.ndof;

  const K=zeros(ndof,ndof), F=vec(ndof,0);
  const fe_elem=Array.from({length:nel},()=>[0,0,0,0]);
  const Pnod=vec(nn,0), Mnod=vec(nn,0);

  // Which span an x belongs to
  function spanIndexAtX(x){
    let acc=0;
    for (let i=0;i<spans.length;i++){ const nx=acc+spans[i]; if (x<=nx+1e-12) return i; acc=nx; }
    return spans.length-1;
  }

  // Loads → element/nodal equivalents
  for (const row of $$(".load-row")){
    const kind=row.querySelector(".badge").textContent.trim();
    const spanIdx=parseInt(row.querySelector('select[name="spanIdx"]')?.value ?? "0",10);
    const Lspan=spans[spanIdx]??0, x0=ends[spanIdx];

    if(kind==="Point"){
      const PkN=parseFloat(row.querySelector('[name="P"]').value||"0");
      const xloc=parseFloat(row.querySelector('[name="x"]').value||"0");
      if(!isFinite(PkN)||!isFinite(xloc)) continue;
      const xg=x0+clamp(xloc,0,Lspan); const node=Math.round((xg/Ltot)*nel);
      if(node>=0&&node<=nel) Pnod[node]-=PkN*1e3; // +down → −
    }
    else if(kind==="UDL"){
      let w1=parseFloat(row.querySelector('[name="w1"]').value||"0");
      let w2=parseFloat(row.querySelector('[name="w2"]').value||"0");
      let aLoc=parseFloat(row.querySelector('[name="a"]').value||"0");
      let bLoc=parseFloat(row.querySelector('[name="b"]').value||"0");
      let a=x0+clamp(aLoc,0,Lspan), b=x0+clamp(bLoc,0,Lspan);
      if(b<a){[a,b]=[b,a];[w1,w2]=[w2,w1];}
      const xa=Math.max(0,Math.min(Ltot,a)), xb=Math.max(0,Math.min(Ltot,b)); if(xb<=xa) continue;
      const slope=(w2-w1)/(b-a||1);
      for(let e=0;e<nel;e++){
        const ex0=e*h, ex1=(e+1)*h;
        const s=Math.max(xa,ex0), t=Math.min(xb,ex1), cover=t-s;
        if(cover<=1e-12) continue;
        const qs=w1+slope*(s-a), qt=w1+slope*(t-a);  // kN/m (+down)
        const qavg_Npm = -0.5*(qs+qt)*1e3;          // to N/m, sign
        const r=cover/h, sN=qavg_Npm*h/2;
        const fe=[sN,sN*h/3,sN,-sN*h/3].map(v=>v*r);
        for(let i=0;i<4;i++) fe_elem[e][i]+=fe[i];
      }
    }
    else if(kind==="Moment"){
      let MkNm=parseFloat(row.querySelector('[name="M"]').value||"0");
      const dir=row.querySelector('[name="mdir"]')?.value==="CW"?-1:1; MkNm*=dir;
      const xloc=parseFloat(row.querySelector('[name="x"]').value||"0");
      if(!isFinite(MkNm)||!isFinite(xloc)) continue;
      const xg=x0+clamp(xloc,0,Lspan), M=MkNm*1e3;
      const eps=1e-12; let e=Math.floor((xg/h)-eps); e=Math.max(0,Math.min(nel-1,e));
      const ex0=e*h; const xi=clamp((xg-ex0)/h,0,1);
      if(xi<=1e-9) Mnod[e]+=M;
      else if(xi>=1-1e-9) Mnod[e+1]+=M;
      else { fe_elem[e][1]+=(1-xi)*M; fe_elem[e][3]+=xi*M; }
    }
  }

  // Assemble element-by-element with local EI
  for(let e=0;e<nel;e++){
    const ex0=e*h, ex1=(e+1)*h, xmid = (ex0+ex1)/2;
    const sIdx = spanIndexAtX(xmid);
    const EI = (E*1e9) * (Ilist[sIdx] ?? Ilist.at(-1));
    const c=EI/(h**3);

    // 4x4 Euler–Bernoulli ke
    const keBase=[[12,6*h,-12,6*h],[6*h,4*h*h,-6*h,2*h*h],[-12,-6*h,12,-6*h],[6*h,2*h*h,-6*h,4*h*h]];
    const ke=keBase.map(r=>r.map(v=>v*c));

    // Local→global DOF mapping (split rotations for hinge nodes)
    const leftNode  = e;
    const rightNode = e+1;
    const dof = [
      map.vidx[leftNode],
      map.thR[leftNode],   // rotation on the RIGHT side of left node
      map.vidx[rightNode],
      map.thL[rightNode],  // rotation on the LEFT side of right node
    ];

    // Assemble ke and fe
    for(let i=0;i<4;i++) for(let j=0;j<4;j++) addTo(K,dof[i],dof[j],ke[i][j]);
    addv(F,dof[0],fe_elem[e][0]); addv(F,dof[1],fe_elem[e][1]);
    addv(F,dof[2],fe_elem[e][2]); addv(F,dof[3],fe_elem[e][3]);
  }

// Nodal point loads & moments
for (let i = 0; i < nn; i++) {
  if (Pnod[i]) addv(F, map.vidx[i], Pnod[i]);

  if (Mnod[i]) {
    // If the node is NOT a hinge, thL === thR (same DOF) → apply ONCE.
    // If it IS a hinge, thL and thR are distinct → split 50/50.
    if (map.thL[i] === map.thR[i]) {
      addv(F, map.thL[i], Mnod[i]);
    } else {
      addv(F, map.thL[i], 0.5 * Mnod[i]);
      addv(F, map.thR[i], 0.5 * Mnod[i]);
    }
  }
}


  // Supports (boundary conditions)
  const restrained=[];
  for(let j=0;j<jointTypes.length;j++){
    const node=Math.round((ends[j]/Ltot)*nel), t=jointTypes[j];
    if(t==="PIN"){
      restrained.push(map.vidx[node]);                  // v = 0
    }
    if(t==="FIX"){
      restrained.push(map.vidx[node], map.thL[node], map.thR[node]); // v=0, θL=0, θR=0
    }
    // HINGE: handled by DOF splitting; no restraint added here.
  }

  return {K:FIXSPD(K),F,restrained,h,nn,nel,Ltot,ends,spans,jointTypes,E,Ilist,map};
}

// small guard: ensure K is strictly numeric
function FIXSPD(K){ return K; }

function solveSystem(K,F,restrained){
  const ndof=F.length, Rset=new Set(restrained), free=[];
  for(let i=0;i<ndof;i++) if(!Rset.has(i)) free.push(i);
  const Kr=free.map(i=>free.map(j=>K[i][j]));
  const Fr=free.map(i=>F[i]);
  const n=Kr.length, A=Kr.map((r,i)=>r.concat([Fr[i]]));
  // Gauss-Jordan
  for(let i=0;i<n;i++){
    let p=i; for(let r=i+1;r<n;r++) if(Math.abs(A[r][i])>Math.abs(A[p][i])) p=r;
    [A[i],A[p]]=[A[p],A[i]];
    const d=A[i][i]||1; for(let j=i;j<=n;j++) A[i][j]/=d;
    for(let r=0;r<n;r++) if(r!==i){ const f=A[r][i]; for(let j=i;j<=n;j++) A[r][j]-=f*A[i][j]; }
  }
  const Ur=A.map(r=>r[n]), U=vec(ndof,0); free.forEach((d,i)=>U[d]=Ur[i]);

  // Reactions at restrained DOFs
  const KU=vec(ndof,0); for(let i=0;i<ndof;i++){ let s=0; for(let j=0;j<ndof;j++) s+=K[i][j]*U[j]; KU[i]=s; }
  const R=restrained.map(d=>KU[d]-F[d]);
  return {U,R};
}

// ---------- Element field recovery (Hermite) ----------
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
  const curv = d2N1*v1 + d2N2*t1 + d2N3*v2 + d2N4*t2;  // w''
  const M  = EI * curv;
  const V  = EI * (d3N1*v1 + d3N2*t1 + d3N3*v2 + d3N4*t2); // EI w'''
  return {v, th, M, V};
}

function buildFields(asb, U, samplesPerEl = 8) {
  const { h, nel, E, Ilist, spans, map } = asb;
  const xs = [], V = [], M = [], th = [], v = [];
  const ends = cumEnds(spans);

  // helper: pick span index for a given x
  function spanIndexAtX(x) {
    let i = 0;
    while (i < spans.length && x > ends[i + 1] - 1e-12) i++;
    return i;
  }

  for (let e = 0; e < nel; e++) {
    // DOFs for element e (with split rotations already handled by map)
    const dofs = [
      U[map.vidx[e]],
      U[map.thR[e]],
      U[map.vidx[e + 1]],
      U[map.thL[e + 1]],
    ];

    // ---- FIX 1: use one EI per element (constant inside the element) ----
    const ex0 = e * h, ex1 = (e + 1) * h;
    const xmid = 0.5 * (ex0 + ex1);
    const sIdx = spanIndexAtX(xmid);
    const EIe = (E * 1e9) * (Ilist[sIdx] ?? Ilist.at(-1));

    // ---- FIX 2: avoid duplicating the shared node sample ----
    // first element includes s=0..1; next elements include s=1..1
    const kStart = (e === 0) ? 0 : 1;

    for (let k = kStart; k <= samplesPerEl; k++) {
      const s = k / samplesPerEl;       // 0..1 within element
      const x = ex0 + s * h;

      // Hermite recovery using EIe (constant within this element)
      const f = hermiteField(h, EIe, dofs, s);

      xs.push(x);
      V.push(f.V);
      M.push(f.M);
      th.push(f.th);
      v.push(f.v);
    }
  }

  // cosmetics: zero end moments at pin/free ends
  const leftType = asb.jointTypes[0];
  const rightType = asb.jointTypes[asb.jointTypes.length - 1];
  if (leftType === "PIN" || leftType === "NONE") M[0] = 0;
  if (rightType === "PIN" || rightType === "NONE") M[M.length - 1] = 0;

  return { x: xs, V, M, th, v };
}


function evalAtX(asb, U, xg){
  const {h, nel, E, Ilist, spans, map} = asb;
  const ends = cumEnds(spans);

  // Element index containing xg (left-biased at joints)
  let e = Math.min(nel-1, Math.max(0, Math.floor(xg/h - 1e-12)));
  const s = Math.max(0, Math.min(1, (xg - e*h)/h));

  // DOFs for that element
  const dofs = [
    U[ map.vidx[e]   ],
    U[ map.thR[e]    ],
    U[ map.vidx[e+1] ],
    U[ map.thL[e+1]  ],
  ];

  // --- Pick EI from the element itself (midspan), NOT from xg ---
  const xmid = (e + 0.5) * h;
  let i = 0;
  while (i < spans.length && xmid > ends[i+1] - 1e-12) i++;
  const EIe = (E * 1e9) * (Ilist[i] ?? Ilist.at(-1));

  return hermiteField(h, EIe, dofs, s);
}


// ---------- Rendering (sketch & diagrams) ----------
function renderAll(asb, sample, loads, jointReactions){
  const {spans, ends, Ltot, jointTypes, Ilist} = asb;
  const w=1000, h=220, pad=40;
  svg.innerHTML="";
  const y0=h/2, scaleX=(w-2*pad)/Ltot;

  // deflection scale
  const vmax = Math.max(...sample.v.map(Math.abs),1e-9);
  const kDef = 50 / vmax;

  const g = svgGroup();

  // beam baseline with thickness by I
  const tScale = thicknessScale(Ilist);
  for(let s=0;s<spans.length;s++){
    const x1=pad+ends[s]*scaleX, x2=pad+ends[s+1]*scaleX;
    const base = svgPath(`M${x1},${y0}L${x2},${y0}`,"beam");
    base.setAttribute("stroke-width", tScale(Ilist[s]));
    g.appendChild(base);
  }

  // supports + reactions
  for(let j=0;j<jointTypes.length;j++){
    const xx = pad + ends[j]*scaleX;
    if (jointTypes[j]==="PIN") g.appendChild(svgPath(trianglePath(xx, y0+4, 12, -10), "support"));
    if (jointTypes[j]==="FIX") g.appendChild(svgPath(`M${xx},${y0-18}L${xx},${y0+18}`, "support"));
    if (jointTypes[j]==="HINGE"){
      const hc = document.createElementNS("http://www.w3.org/2000/svg","circle");
      hc.setAttribute("cx", xx); hc.setAttribute("cy", y0); hc.setAttribute("r", 4);
      hc.setAttribute("class","support"); g.appendChild(hc);
    }

    const Rv = jointReactions?.find(r=>r.joint===j && r.kind==="V")?.val ?? 0;
    const Mv = jointReactions?.find(r=>r.joint===j && r.kind==="M")?.val ?? 0;

    if (Math.abs(Rv)>1e-8){
      const dir = Rv>=0? -1:+1;
      g.appendChild(pointArrow(xx, y0-22, dir, 16, 6));
      g.appendChild(svgText(`${fmt(Rv/1e3)}`, xx+6, y0-26*dir,"10px"));
    }
    if (jointTypes[j]==="FIX" && Math.abs(Mv)>1e-8){
      g.appendChild(momentCurl(xx-16, y0-26, Mv>=0?+1:-1));
      g.appendChild(svgText(`${fmt(Math.abs(Mv/1e3))}`, xx-28, y0-38,"10px"));
    }
  }

  // loads
// loads
for (const L of loads) {
  if (L.kind === "Point") {
    const xx   = pad + L.xg * scaleX;
    const isUp = L.PkN < 0;            // negative = upward
    const yTop = isUp ? (y0 + 40) : (y0 - 40);
    const dir  = isUp ? -1 : +1;       // -1 = arrow points up
    g.appendChild(pointArrow(xx, yTop, dir));
  } else if (L.kind === "UDL") {
    const xa   = pad + L.xa * scaleX, xb = pad + L.xb * scaleX;
    const avg  = 0.5 * (L.w1 + L.w2);  // sign of distributed load
    const isUp = avg < 0;
    const yBase = isUp ? (y0 + 40) : (y0 - 40);
    const kH = 12;
    const yA = yBase - L.w1 * kH * 0.15;
    const yB = yBase - L.w2 * kH * 0.15;

    const poly = document.createElementNS("http://www.w3.org/2000/svg","path");
    poly.setAttribute("d", `M${xa},${yBase}L${xa},${yA}L${xb},${yB}L${xb},${yBase}Z`);
    poly.setAttribute("class","udl");
    poly.setAttribute("fill","rgba(90,167,255,0.25)");
    g.appendChild(poly);

    for (let xpx = Math.ceil(xa/30)*30; xpx <= xb; xpx += 30) {
      g.appendChild(pointArrow(xpx, yBase, isUp ? -1 : +1, 14, 7));
    }
  } else if (L.kind === "Moment") {
    const xx = pad + L.xg * scaleX;
    g.appendChild(momentCurl(xx, y0 - 28, L.sign >= 0 ? 1 : -1));
  }
}



  // elastic curve
  const pts = sample.x.map((xi,i)=>`${pad+xi*scaleX},${y0 - sample.v[i]*kDef}`).join(" ");
  const pl = document.createElementNS("http://www.w3.org/2000/svg","polyline");
  pl.setAttribute("points",pts); pl.setAttribute("class","udl");
  pl.setAttribute("fill","none"); pl.setAttribute("stroke-width","2"); g.appendChild(pl);

  svg.appendChild(g);
}

function getDiagramWrap() {
  let wrap = document.getElementById("diagramWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "diagramWrap";
    const sketchWrap = svg.parentElement;
    sketchWrap.parentElement.appendChild(wrap);
  }
  return wrap;
}

function drawDiagrams(asb, field){
  const wrap = getDiagramWrap();
  wrap.innerHTML = "";

  const items = [
    {name:"Shear V (kN)",     data: field.V.map(_=>_/1e3)},
    {name:"Moment M (kN·m)",  data: field.M.map(_=>_/1e3)},
    {name:"Slope θ (rad)",    data: field.th},
    {name:"Deflection δ (mm)",data: field.v.map(_=>_*1e3)},
  ];

  const W = 1000;
  const H = 150;
  const pad = 48;
  const Ltot = asb.Ltot;
  const scaleX = (W - 2*pad) / Ltot;

  for (const it of items) {
    const s = document.createElementNS("http://www.w3.org/2000/svg","svg");
    s.setAttribute("viewBox", `0 0 ${W} ${H}`);
    s.setAttribute("class", "diag");
    s.style.display  = "block";
    s.style.position = "static";
    s.style.width    = "100%";
    s.style.height   = `${H}px`;
    s.style.margin   = "12px 0 20px";

    s.appendChild(svgText(it.name, 12, 18, "12px"));

    const y0 = Math.round(H/2);
    s.appendChild(svgPath(`M${pad},${y0}L${W-pad},${y0}`, "support"));

// ---- CLEAN ORDINATES: symmetric scale + near-zero clamp ----

// copy so we can clean without touching the original
const series = it.data.slice();

// single symmetric scale for + and − (prevents zero-crossing spikes)
const maxAbs = Math.max(1e-12, ...series.map(v => Math.abs(v)));

// clamp tiny numerical noise to zero
const eps = 1e-6 * maxAbs;
for (let i = 0; i < series.length; i++) {
  if (Math.abs(series[i]) < eps) series[i] = 0;
}

// visually force end ordinates to zero for shear/moment
if (/^Shear|^Moment/.test(it.name)) {
  series[0] = 0;
  series[series.length - 1] = 0;
}

const kY = (H/2 - 28) / maxAbs;

const pts = field.x.map((xi, i) => {
  const xpx = pad + xi * scaleX;
  const ypx = y0 - series[i] * kY;
  return `${xpx},${ypx}`;
}).join(" ");

// draw the polyline (this is what shows the diagram)
const pl = document.createElementNS("http://www.w3.org/2000/svg","polyline");
pl.setAttribute("points", pts);
pl.setAttribute("class", "udl");
pl.setAttribute("fill", "none");
pl.setAttribute("stroke-width", "2");
s.appendChild(pl);

// updated labels using the cleaned series
const maxPos = Math.max(0, ...series);
const maxNeg = Math.max(0, ...series.map(v => -v));
s.appendChild(svgText(`+${fmt(maxPos)}`, W - pad - 70, 18, "10px"));
s.appendChild(svgText(`−${fmt(maxNeg)}`, W - pad - 70, H - 10, "10px"));

wrap.appendChild(s);

  }
}

// ---------- Solve & report ----------
function nearestNode(xg,Ltot,nel){ return Math.round((xg/Ltot)*nel); }
function svgGroup(){ return document.createElementNS("http://www.w3.org/2000/svg","g"); }
function svgPath(d,cls){ const p=document.createElementNS("http://www.w3.org/2000/svg","path"); p.setAttribute("d",d); p.setAttribute("class",cls); return p; }
function svgText(t,x,y,size="11px"){ const el=document.createElementNS("http://www.w3.org/2000/svg","text"); el.setAttribute("x",x); el.setAttribute("y",y); el.setAttribute("fill","#9bb0c5"); el.setAttribute("font-size",size); el.textContent=t; return el; }
function trianglePath(cx,cy,w,h){ return `M${cx-w/2},${cy}L${cx+w/2},${cy}L${cx},${cy+h}Z`; }
function pointArrow(x,yTop,dir=+1,len=18,head=6){ const y1=yTop,y2=yTop+dir*len; const d=`M${x},${y1}L${x},${y2} M${x-head},${y2-dir*head}L${x},${y2}L${x+head},${y2-dir*head}`; return svgPath(d,"load-arrow"); }
// Bold, high-contrast moment curl with a halo, and *never* any fill.
function momentCurl(x, yTop, ccw = +1){
  const r = 12;
  const cx = x, cy = yTop;
  const sweep = ccw > 0 ? 1 : 0;

  const sx = cx - r, sy = cy;
  const ex = cx + r, ey = cy;

  const g = document.createElementNS("http://www.w3.org/2000/svg","g");
  // Block any inherited fill from CSS (even with !important elsewhere)
  g.setAttribute("fill", "none");

  // HALO
  const halo = document.createElementNS("http://www.w3.org/2000/svg","path");
  halo.setAttribute("d", `M${sx},${sy} A ${r},${r} 0 1 ${sweep} ${ex},${ey}`);
  halo.setAttribute("fill", "none");
  halo.setAttribute("stroke", "rgba(255,255,255,0.28)");
  halo.setAttribute("stroke-width", "6");
  halo.setAttribute("stroke-linecap", "round");
  halo.setAttribute("stroke-linejoin", "round");
  // extra guard against CSS fill:
  halo.setAttribute("style", "fill:none!important");
  g.appendChild(halo);

  // MAIN ARC
  const arc = document.createElementNS("http://www.w3.org/2000/svg","path");
  arc.setAttribute("d", `M${sx},${sy} A ${r},${r} 0 1 ${sweep} ${ex},${ey}`);
  arc.setAttribute("class","load-arrow");      // to reuse your stroke color
  arc.setAttribute("fill","none");
  arc.setAttribute("stroke-width","3");
  arc.setAttribute("stroke-linecap","round");
  arc.setAttribute("stroke-linejoin","round");
  arc.setAttribute("style","fill:none!important");
  g.appendChild(arc);

  // ARROW HEAD
  const head = document.createElementNS("http://www.w3.org/2000/svg","path");
  const headD = (ccw > 0)
    ? `M${ex},${ey} L${ex-8},${ey-8} M${ex},${ey} L${ex-8},${ey+8}`
    : `M${sx},${sy} L${sx+8},${sy-8} M${sx},${sy} L${sx+8},${sy+8}`;
  head.setAttribute("d", headD);
  head.setAttribute("class","load-arrow");
  head.setAttribute("fill","none");
  head.setAttribute("stroke-width","3");
  head.setAttribute("stroke-linecap","round");
  head.setAttribute("stroke-linejoin","round");
  head.setAttribute("style","fill:none!important");
  g.appendChild(head);

  return g;
}


function reactionAtDOF(Rarr, restrained, dof){ const i=restrained.indexOf(dof); return i>=0?Rarr[i]:0; }

function exactCols(show){ $$(".exact-col").forEach(el => el.hidden = !show); }

// ---------- (NEW) simple helpers reused by preview & solve ----------
function currentJointTypes(){
  const spans = parseSpans();
  if (!spans.length) return [];
  if (!document.getElementById("jointSupportPanel")) rebuildJointSupportPanel();
  return getJointSupports(spans);
}
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
    } else if(kind==="UDL"){
      let w1=parseFloat(row.querySelector('[name="w1"]').value||"0");
      let w2=parseFloat(row.querySelector('[name="w2"]').value||"0");
      let aLoc=parseFloat(row.querySelector('[name="a"]').value||"0");
      let bLoc=parseFloat(row.querySelector('[name="b"]').value||"0");
      let a=x0+clamp(aLoc,0,Lspan), b=x0+clamp(bLoc,0,Lspan);
      if(b<a){[a,b]=[b,a];[w1,w2]=[w2,w1];}
      if(b>a&&(w1!==0||w2!==0)) out.push({kind:"UDL",xa:a,xb:b,w1,w2});
    } else if(kind==="Moment"){
      const MkNm=parseFloat(row.querySelector('[name="M"]').value||"0");
      const dir=row.querySelector('[name="mdir"]')?.value==="CW"?-1:1;
      const xloc=parseFloat(row.querySelector('[name="x"]').value||"0");
      const xg=x0+clamp(xloc,0,Lspan); if(MkNm!==0) out.push({kind:"Moment",xg,sign:Math.sign(MkNm*dir)});
    }
  }
  return out;
}

// ---------- (NEW) Preview that updates live ----------
function drawPreview(){
  const spans=parseSpans(); if(!spans.length){ svg.innerHTML=""; return; }
  const ends = cumEnds(spans);
  const Ilist = parseIList(spans);
  const jointTypes = currentJointTypes();
  const loads = currentLoadsForDrawing(spans, ends);

  const w=1000, h=220, pad=40;
  const y0=h/2, Ltot=ends.at(-1)||1, scaleX=(w-2*pad)/Ltot;

  svg.innerHTML="";
  const g = svgGroup();

  // beam with thickness by I
  const tScale = thicknessScale(Ilist);
  for(let s=0;s<spans.length;s++){
    const x1=pad+ends[s]*scaleX, x2=pad+ends[s+1]*scaleX;
    const base = svgPath(`M${x1},${y0}L${x2},${y0}`,"beam");
    base.setAttribute("stroke-width", tScale(Ilist[s]));
    g.appendChild(base);
  }

  // supports (no reactions in preview)
  for(let j=0;j<jointTypes.length;j++){
    const xx = pad + ends[j]*scaleX;
    if (jointTypes[j]==="PIN")  g.appendChild(svgPath(trianglePath(xx, y0+4, 12, -10), "support"));
    if (jointTypes[j]==="FIX")  g.appendChild(svgPath(`M${xx},${y0-18}L${xx},${y0+18}`, "support"));
    if (jointTypes[j]==="HINGE"){
      const hc = document.createElementNS("http://www.w3.org/2000/svg","circle");
      hc.setAttribute("cx", xx); hc.setAttribute("cy", y0); hc.setAttribute("r", 4);
      hc.setAttribute("class","support"); g.appendChild(hc);
    }
  }

  // loads
// loads (sign-aware preview)
for (const L of loads) {
  if (L.kind === "Point") {
    const xx   = pad + L.xg * scaleX;
    const isUp = L.PkN < 0;            // negative = upward
    const yTop = isUp ? (y0 + 40) : (y0 - 40);
    const dir  = isUp ? -1 : +1;       // -1 draws arrow upward
    g.appendChild(pointArrow(xx, yTop, dir));
  } else if (L.kind === "UDL") {
    const xa   = pad + L.xa * scaleX, xb = pad + L.xb * scaleX;
    const avg  = 0.5 * (L.w1 + L.w2);  // determine sign from average
    const isUp = avg < 0;
    const yBase = isUp ? (y0 + 40) : (y0 - 40);
    const kH = 12;

    // height uses magnitude; polygon always grows away from base toward the beam
    const yA = yBase - Math.abs(L.w1) * kH * 0.15;
    const yB = yBase - Math.abs(L.w2) * kH * 0.15;

    const poly = document.createElementNS("http://www.w3.org/2000/svg","path");
    poly.setAttribute("d", `M${xa},${yBase}L${xa},${yA}L${xb},${yB}L${xb},${yBase}Z`);
    poly.setAttribute("class", "udl");
    poly.setAttribute("fill", "rgba(90,167,255,0.25)");
    g.appendChild(poly);

    for (let xpx = Math.ceil(xa/30) * 30; xpx <= xb; xpx += 30) {
      g.appendChild(pointArrow(xpx, yBase, isUp ? -1 : +1, 14, 7));
    }
  } else if (L.kind === "Moment") {
    const xx = pad + L.xg * scaleX;
    g.appendChild(momentCurl(xx, y0 - 28, L.sign >= 0 ? 1 : -1));
  }
}


  svg.appendChild(g);
}
// === Deflection extrema helpers ============================================
function _lerp(a, b, t) { return a + (b - a) * t; }

// Find zeroes of slope theta and classify with curvature sign ~ M/EI
function findDeflectionExtrema(field, ends, Ilist, E, opts = {}) {
  const x = field.x, v = field.v, th = field.th, M = field.M;
  if (!x || !v || !th || !M) return [];

  const tolSlope = opts.tolSlope ?? 1e-9;
  const mergeDx  = opts.mergeDx  ?? 1e-6;

  // EI at any x (piecewise-constant per span)
  const EIat = (xx) => {
    let i = 0;
    while (i < Ilist.length && xx > ends[i+1] - 1e-12) i++;
    const I = Ilist[i] ?? Ilist.at(-1);
    return (E * 1e9) * I;
  };

  const n = Math.min(x.length, v.length, th.length, M.length);
  const out = [];
  for (let i = 1; i < n; i++) {
    let a = th[i - 1], b = th[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a) < tolSlope) a = 0;
    if (Math.abs(b) < tolSlope) b = 0;

    // zero at a grid point
    if (a === 0 && b !== 0) {
      const x0 = x[i - 1], v0 = v[i - 1];
      const curv = M[i - 1] / (EIat(x0) || 1);
      out.push({ x: x0, v: v0, kind: curv < 0 ? "max" : curv > 0 ? "min" : "flat" });
      continue;
    }
    if (b === 0 && a !== 0) {
      const x0 = x[i], v0 = v[i];
      const curv = M[i] / (EIat(x0) || 1);
      out.push({ x: x0, v: v0, kind: curv < 0 ? "max" : curv > 0 ? "min" : "flat" });
      continue;
    }

    // plateau or sign change across segment
    if (a === 0 && b === 0) {
      const t = 0.5, x0 = _lerp(x[i - 1], x[i], t);
      const v0 = _lerp(v[i - 1], v[i], t);
      const curv = _lerp(M[i - 1], M[i], t) / (EIat(x0) || 1);
      out.push({ x: x0, v: v0, kind: curv < 0 ? "max" : curv > 0 ? "min" : "flat" });
    } else if (a * b < 0) {
      const t = Math.abs(a) / (Math.abs(a) + Math.abs(b)); // theta=0 crossing
      const x0 = _lerp(x[i - 1], x[i], t);
      const v0 = _lerp(v[i - 1], v[i], t);
      const curv = _lerp(M[i - 1], M[i], t) / (EIat(x0) || 1);
      out.push({ x: x0, v: v0, kind: curv < 0 ? "max" : "min" });
    }
  }

  // merge near-duplicates
  out.sort((p, q) => p.x - q.x);
  const merged = [];
  for (const e of out) {
    const last = merged[merged.length - 1];
    if (!last || Math.abs(e.x - last.x) > mergeDx) merged.push(e);
    else if (Math.abs(e.v) > Math.abs(last.v)) merged[merged.length - 1] = e;
  }
  return merged;
}

// Render a compact list into the Max Deflection card (next to #Dmax)
function renderDeflectionExtremaList(extrema) {
  const dEl = document.getElementById("Dmax");
  if (!dEl) return;
  const card = dEl.closest(".card") || dEl.parentElement;

  let list = card.querySelector("#DextremaList");
  if (!list) {
    list = document.createElement("div");
    list.id = "DextremaList";
    list.style.marginTop = "8px";
    list.style.fontSize = "0.95rem";
    card.appendChild(list);
  }

  if (!extrema.length) {
    list.innerHTML = `<em>No interior max/min (only monotonic or endpoints).</em>`;
    return;
  }

  list.innerHTML = `
    <div style="opacity:.85">All local extrema (θ=0):</div>
    <ul style="margin:.25rem 0 0 .9rem; padding:0;">
      ${extrema.map(e =>
        `<li>${e.kind === "max" ? "Maximum" : e.kind === "min" ? "Minimum" : "Flat"}
           at x = ${Number(e.x).toFixed(4)} m,
           δ = ${Number(e.v*1e3).toFixed(5)} mm</li>`
      ).join("")}
    </ul>`;
}

// ---------- Solve (unchanged math; visuals enhanced by thickness) ----------
function solve(){
  const vmCardTitle = Array.from(document.querySelectorAll(".card h3")).find(h=>/Max \|M\|/.test(h.textContent||""));
  if (vmCardTitle) vmCardTitle.parentElement.style.display="none";

  const spans=parseSpans(), E=parseFloat(EEl.value);
  const Ilist=parseIList(spans);
  const nel=Math.max(80, Math.min(3000, parseInt(nelEl.value||"240",10)));
  if(!spans.length||!(E>0)||!Ilist.every(v=>v>0)){ alert("Please enter valid spans, E, and I (single or per-span list)."); return; }

  if(!document.getElementById("jointSupportPanel")) rebuildJointSupportPanel();
  const jointTypes=getJointSupports(spans);

  const asb=assemble(spans,E,Ilist,nel,jointTypes);
  const {U,R}=solveSystem(asb.K,asb.F,asb.restrained);

  // Sample fields
  const field = buildFields(asb, U, 12);

  // Reactions mapped by joint (for drawing)
  const jointReactions=[];
  for(let j=0;j<asb.jointTypes.length;j++){
    const node=nearestNode(asb.ends[j],asb.Ltot,asb.nel);
    if(asb.jointTypes[j]==="PIN"||asb.jointTypes[j]==="FIX"){
      jointReactions.push({joint:j,kind:"V",val:reactionAtDOF(R,asb.restrained,asb.map.vidx[node])});
    }
    if (asb.jointTypes[j] === "FIX") {
      let Mv = 0;
      if (j === 0) {
        // left physical end → use rotation that belongs to the first element
        Mv = reactionAtDOF(R, asb.restrained, asb.map.thR[node]);
      } else if (j === asb.jointTypes.length - 1) {
        // right physical end → use rotation that belongs to the last element
        Mv = reactionAtDOF(R, asb.restrained, asb.map.thL[node]);
      } else {
        // interior fixed joint (rare) → both sides are real
        Mv = reactionAtDOF(R, asb.restrained, asb.map.thL[node]) +
             reactionAtDOF(R, asb.restrained, asb.map.thR[node]);
      }
      jointReactions.push({ joint: j, kind: "M", val: Mv });
    }
  }
  // Convenience getters for support cards (reuse what the sketch shows)
  const jLeft  = 0;
  const jRight = asb.jointTypes.length - 1;

  const VleftN  = jointReactions.find(r => r.joint === jLeft  && r.kind === "V")?.val ?? 0;
  const VrightN = jointReactions.find(r => r.joint === jRight && r.kind === "V")?.val ?? 0;

  // Build loads (for drawing only)
  const loadsDraw=currentLoadsForDrawing(spans, asb.ends);

  // Render
  renderAll(asb, field, loadsDraw, jointReactions);
  drawDiagrams(asb, field);

// --- Max deflection (keep single-value display) -----------------------------
let imax = 0;
for (let i = 1; i < field.v.length; i++)
  if (Math.abs(field.v[i]) > Math.abs(field.v[imax])) imax = i;
$("#Dmax").textContent = `${fmt(field.v[imax]*1e3)} @ x=${fmt(field.x[imax])}`;

// --- All local extrema (θ = 0), classified by curvature (M/EI) -------------
const extrema = findDeflectionExtrema(field, asb.ends, asb.Ilist, E, {
  tolSlope: 1e-8,
  mergeDx:  1e-4
});
renderDeflectionExtremaList(extrema);


  // End reactions (cards)
  const leftType  = asb.jointTypes[0];
  const rightType = asb.jointTypes.at(-1);

  // Moments: we already fixed these to use the active end DOF (or field)
  const MleftNm  = (leftType  === "FIX")
    ? reactionAtDOF(R, asb.restrained, asb.map.thR[0])   : 0;
  const MrightNm = (rightType === "FIX")
    ? reactionAtDOF(R, asb.restrained, asb.map.thL[asb.nel]) : 0;

  // Verticals: read exactly what the sketch uses
  const RleftN  = (leftType  === "PIN" || leftType  === "FIX") ? VleftN  : 0;
  const RrightN = (rightType === "PIN" || rightType === "FIX") ? VrightN : 0;

  // Display: keep moments as magnitude + dir tag (per your preference)
  const dirL = MleftNm  >= 0 ? "CCW" : "CW";
  const dirR = MrightNm >= 0 ? "CCW" : "CW";

  $("#Rleft").textContent   = fmt(RleftN/1e3);
  $("#Mleft").textContent   = `${fmt(Math.abs(MleftNm/1e3))} ${dirL}`;

  $("#Rright").textContent  = fmt(RrightN/1e3);
  $("#Mright").textContent  = `${fmt(Math.abs(MrightNm/1e3))} ${dirR}`;

  // Probes
  fillProbes(asb, U);

  // Exact columns toggle
  exactCols(!!exactBox.checked);
  if (exactBox.checked){
    const rL = approxFraction((RleftN/1e3));
    const mL = approxFraction((MleftNm/1e3));
    const rR = approxFraction((RrightN/1e3));
    const mR = approxFraction((MrightNm/1e3));
    $("#RleftExact").hidden = false;
    $("#RrightExact").hidden = false;
    $("#RleftExact").textContent = `R: ${rL ?? "—"} , M: ${mL ?? "—"}`;
    $("#RrightExact").textContent = `R: ${rR ?? "—"} , M: ${mR ?? "—"}`;
  } else {
    $("#RleftExact").hidden = true;
    $("#RrightExact").hidden = true;
  }

  // CSV payload
  window.__beam = { x: field.x, V: field.V, M: field.M, d: field.v };
  $("#results").hidden=false;
}

function fillProbes(asb, U){
  const tbody=$("#probeTable tbody"); if(!tbody) return;
  tbody.innerHTML="";
  const spans=asb.spans, ends=asb.ends;
  $$("#probes .load-row").forEach(row=>{
    const spanIdx=parseInt(row.querySelector('select[name="spanIdx"]').value,10);
    const Lspan=spans[spanIdx]??0, x0=ends[spanIdx];
    const xloc=parseFloat(row.querySelector('[name="x"]').value||"0");
    const xg=x0+clamp(xloc,0,Lspan);
    const f=evalAtX(asb, U, xg);

    const tr=document.createElement("tr");
    tr.innerHTML=`<td style="text-align:center">${spanIdx+1}</td>
      <td>${fmt(xloc)}</td>
      <td>${fmt(f.V/1e3)}</td>
      <td>${fmt(f.M/1e3)}</td>
      <td>${fmt(f.th)}</td>
      <td>${fmt(f.v*1e3)}</td>`;

    if (exactBox.checked){
      const Vfrac = approxFraction(f.V/1e3);
      const Mfrac = approxFraction(f.M/1e3);
      const thF   = approxFraction(f.th);
      const vF    = approxFraction(f.v*1e3);
      const tdV = document.createElement("td"); tdV.className="exact-col"; tdV.textContent = Vfrac ?? "—";
      const tdM = document.createElement("td"); tdM.className="exact-col"; tdM.textContent = Mfrac ?? "—";
      const tdT = document.createElement("td"); tdT.className="exact-col"; tdT.textContent = thF ?? "—";
      const tdD = document.createElement("td"); tdD.className="exact-col"; tdD.textContent = vF ?? "—";
      tr.appendChild(tdV); tr.appendChild(tdM); tr.appendChild(tdT); tr.appendChild(tdD);
    }
    tbody.appendChild(tr);
  });
}

// ---------- CSV ----------
function downloadCSV(){
  const b=window.__beam; if(!b){ alert("Compute first."); return; }
  let csv="x(m),V(N),M(Nm),deflection(m)\n";
  for(let i=0;i<b.x.length;i++) csv+=`${b.x[i]},${b.V[i]},${b.M[i]},${b.d[i]}\n`;
  const blob=new Blob([csv],{type:"text/csv"}); const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download="beam_results.csv"; a.click(); URL.revokeObjectURL(a.href);
}

// ---------- live listeners for preview ----------
["loads","probes"].forEach(id=>{
  const box = document.getElementById(id);
  if (!box) return;
  box.addEventListener("input", drawPreview, true);
  box.addEventListener("change", drawPreview, true);
  new MutationObserver(drawPreview).observe(box, {childList:true, subtree:true});
});

// ---------- boot ----------
rebuildJointSupportPanel();
ensureLoadSpanSelectors();
ensureProbeSpanSelectors();
(function(){
  const addRowBtn = $("#addUDL"); if (addRowBtn) addRowBtn.click();
  const addProbeBtn = $("#addProbe"); if (addProbeBtn) addProbeBtn.click();
  drawPreview(); // initial visual
})();
