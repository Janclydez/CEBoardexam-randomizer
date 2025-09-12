const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());   // ✅ allows POST body parsing
app.use(express.static('public'));

const QUESTIONS_FOLDER = path.join(__dirname, 'psadquestions');
const FACULTY_FOLDER = path.join(QUESTIONS_FOLDER, 'faculty');

// 🔹 Serve images
app.use('/psadquestions', express.static(QUESTIONS_FOLDER));

/**
 * 🔹 Utility: Load and parse JSON safely
 */
function loadJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`⚠️ Skipping ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * 🔹 Utility: Shuffle array
 */
function shuffleArray(array) {
  return array.sort(() => 0.5 - Math.random());
}

/**
 * 🔹 GET /tags
 * Returns unique main and sub tags.
 * Supports ?faculty=true
 */
app.get('/tags', (req, res) => {
  const isFaculty = req.query.faculty === 'true';
  const folder = isFaculty ? FACULTY_FOLDER : QUESTIONS_FOLDER;
  const mainTags = new Set();
  const subTags = new Set();

  try {
    const files = fs.readdirSync(folder).filter(f => f.endsWith('.json') && (!isFaculty || /^f\d+\.json$/.test(f)));

    files.forEach(file => {
      const data = loadJSON(path.join(folder, file));
      if (!data) return;

      const entries = Array.isArray(data) ? data : [data];

      entries.forEach(entry => {
        if (entry.mainTag) mainTags.add(entry.mainTag);
        if (entry.subTag) subTags.add(entry.subTag);
      });
    });

    res.json({
      mainTags: Array.from(mainTags).sort(),
      subTags: Array.from(subTags).sort()
    });
  } catch (err) {
    console.error('❌ Failed to load tags:', err.message);
    res.status(500).json({ error: 'Failed to load tags.' });
  }
});

/**
 * 🔹 GET /generate-exam
 * Standard user exam generator
 */
app.get('/generate-exam', (req, res) => {
  const mainTags = req.query.mainTags?.split(',') || [];
  const subTags = req.query.subTags?.split(',') || [];
  const count = parseInt(req.query.count) || 1;

  try {
    const files = fs.readdirSync(QUESTIONS_FOLDER)
      .filter(f => f.endsWith('.json') && !/^f\d+\.json$/.test(f));

    const matches = [];

    files.forEach(file => {
      const data = loadJSON(path.join(QUESTIONS_FOLDER, file));
      if (!data) return;

      const entries = Array.isArray(data) ? data : [data];

      entries.forEach(entry => {
        const matchMain = mainTags.length === 0 || mainTags.includes(entry.mainTag);
        const matchSub = subTags.length === 0 || subTags.includes(entry.subTag);

        if (matchMain && matchSub) {
          entry.subquestions?.forEach(sub => {
            sub.choices = shuffleArray(sub.choices);
          });
          matches.push(entry);
        }
      });
    });

    const selected = shuffleArray(matches).slice(0, count);
    res.json(selected);
  } catch (err) {
    console.error('❌ Failed to generate exam:', err.message);
    res.status(500).json({ error: 'Failed to generate exam.' });
  }
});

/**
 * 🔹 GET /generate-faculty-exam
 * Faculty exam generator (f*.json only)
 * Supports same tag filtering and count
 */
app.get('/generate-faculty-exam', (req, res) => {
  const mainTags = req.query.mainTags?.split(',') || [];
  const subTags = req.query.subTags?.split(',') || [];
  const count = parseInt(req.query.count) || 999;

  try {
    const files = fs.readdirSync(FACULTY_FOLDER).filter(f => /^f\d+\.json$/.test(f));
    const matches = [];

    files.forEach(file => {
      const data = loadJSON(path.join(FACULTY_FOLDER, file));
      if (!data) return;

      const id = path.parse(file).name;
      const entries = Array.isArray(data) ? data : [data];

      entries.forEach(entry => {
        const matchMain = mainTags.length === 0 || mainTags.includes(entry.mainTag);
        const matchSub = subTags.length === 0 || subTags.includes(entry.subTag);

        if (matchMain && matchSub) {
          entry.id = id;
          entry.subquestions?.forEach(sub => {
            const correct = sub.correctAnswer;
            sub.choices = shuffleArray(sub.choices);
            sub.correctAnswer = sub.choices.find(c => c === correct);
          });
          matches.push(entry);
        }
      });
    });

    const selected = shuffleArray(matches).slice(0, count);
    res.json(selected);
  } catch (err) {
    console.error('❌ Error generating faculty exam:', err.message);
    res.status(500).send('Failed to generate faculty exam.');
  }
});


// =====================================================
// 🔹 Beam Modeler integration
// =====================================================

// Serve the Beam Modeler UI
app.use('/beam-modeler', express.static(path.join(__dirname, 'public/beam-modeler')));

// Health check
app.get('/health', (_, res) => res.json({ ok: true }));

// API endpoint
app.post('/api/beam/solve', (req, res) => {
  try {
    const model = req.body;
    const out = solveBeam(model);
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || 'Solve error' });
  }
});

// ---- FEM Core (Euler–Bernoulli beam) -----------------
function solveBeam({ nodes, elements, supports, loads }) {
  if (!nodes || nodes.length < 2) throw new Error('At least 2 nodes required');
  const nNode = nodes.length;
  const dofPerNode = 2; // v, theta
  const nDOF = nNode * dofPerNode;

  // Global stiffness and load vector
  const K = zeros(nDOF, nDOF);
  const F = zeros(nDOF, 1);

  // Apply nodal loads
  if (loads && loads.Fy) Object.entries(loads.Fy).forEach(([nodeStr, val]) => {
    const n = parseInt(nodeStr, 10);
    F[2*n + 0][0] += val;
  });
  if (loads && loads.Mz) Object.entries(loads.Mz).forEach(([nodeStr, val]) => {
    const n = parseInt(nodeStr, 10);
    F[2*n + 1][0] += val;
  });

  // Element assembly
  const eData = elements.map((e) => {
    const xi = nodes[e.i], xj = nodes[e.j];
    const L = Math.abs(xj - xi);
    if (L <= 0) throw new Error('Element with zero/negative length');
    const { ke, feq } = beamElement(e.E, e.I, L, e.q || 0);
    const map = [2*e.i, 2*e.i+1, 2*e.j, 2*e.j+1];
    addSubmatrix(K, ke, map);
    addSubvector(F, feq, map);
    return { ...e, L, map };
  });

  // Boundary conditions
  const restrained = new Set();
  (supports || []).forEach(s => {
    const n = s.node;
    if (s.type === 'fixed') { restrained.add(2*n); restrained.add(2*n+1); }
    else if (s.type === 'pin' || s.type === 'roller') { restrained.add(2*n); }
  });

  const all = Array.from({ length: nDOF }, (_, i) => i);
  const R = Array.from(restrained.values()).sort((a, b) => a - b);
  const rset = new Set(R);
  const FDOF = all.filter(i => !rset.has(i));
  if (FDOF.length === 0) throw new Error('All DOFs restrained; structure is locked.');

  const Kff = submatrix(K, FDOF, FDOF);
  const Krf = submatrix(K, R, FDOF);
  const Ff  = subvector(F, FDOF);
  const Fr  = subvector(F, R);

  const df = solveLinear(Kff, Ff);
  const Rvec = subMulAdd(Krf, df, Fr, -1);

  const d = zeros(nDOF,1);
  FDOF.forEach((idx,k)=>{ d[idx][0] = df[k][0]; });

  const elemForces = [];
  const samples = { x: [], V: [], M: [], v: [], theta: [] };
  const nSamplesPerElem = 25;

  eData.forEach((e) => {
    const { L, map, E, I, q=0 } = e;
    const de = [ d[map[0]][0], d[map[1]][0], d[map[2]][0], d[map[3]][0] ];
    const { ke, feq } = beamElement(E, I, L, q);
    const fe = matVec(ke, de).map((v,i)=> v - feq[i][0]);
    elemForces.push({ element: e, endForces: { V1: fe[0], M1: fe[1], V2: fe[2], M2: fe[3] } });

    for (let k=0; k<=nSamplesPerElem; k++){
      const xi = k/nSamplesPerElem;
      const xg = nodes[e.i] + xi*L;
      const N1 = 1 - 3*xi*xi + 2*xi*xi*xi;
      const N2 = L*(xi - 2*xi*xi + xi*xi*xi);
      const N3 = 3*xi*xi - 2*xi*xi*xi;
      const N4 = L*(-xi*xi + xi*xi*xi);
      const w  = N1*de[0] + N2*de[1] + N3*de[2] + N4*de[3];
      const dN1 = (-6*xi + 6*xi*xi)/L;
      const dN2 = (1 - 4*xi + 3*xi*xi);
      const dN3 = (6*xi - 6*xi*xi)/L;
      const dN4 = (-2*xi + 3*xi*xi);
      const theta = dN1*de[0] + dN2*de[1] + dN3*de[2] + dN4*de[3];
      const ddN1 = (-6 + 12*xi)/(L*L);
      const ddN2 = (-4 + 6*xi)/L;
      const ddN3 = (6 - 12*xi)/(L*L);
      const ddN4 = (-2 + 6*xi)/L;
      const M = E*I*(ddN1*de[0] + ddN2*de[1] + ddN3*de[2] + ddN4*de[3]);
      const eps = 1e-5, xi2 = Math.min(1, xi+eps);
      const ddN1b = (-6 + 12*xi2)/(L*L);
      const ddN2b = (-4 + 6*xi2)/L;
      const ddN3b = (6 - 12*xi2)/(L*L);
      const ddN4b = (-2 + 6*xi2)/L;
      const Mb = E*I*(ddN1b*de[0] + ddN2b*de[1] + ddN3b*de[2] + ddN4b*de[3]);
      const V = (Mb - M)/((xi2 - xi)*L);
      samples.x.push(xg);
      samples.v.push(w);
      samples.theta.push(theta);
      samples.M.push(M);
      samples.V.push(V);
    }
  });

  const reactions = [];
  R.forEach((idx,k)=>{
    const node = Math.floor(idx/2);
    const isTheta = (idx%2===1);
    reactions.push({ node, dof: isTheta?'theta':'v', value: Rvec[k][0] });
  });

  return { dof: d.map(r=>r[0]), reactions, elemForces, samples };
}

// ---- Beam element and helpers ---------------------------------------------
function beamElement(E, I, L, q){
  const L2=L*L, L3=L2*L, f=E*I;
  const ke = [
    [ 12*f/L3,   6*f/L2,  -12*f/L3,   6*f/L2 ],
    [  6*f/L2,   4*f/L,    -6*f/L2,   2*f/L  ],
    [ -12*f/L3, -6*f/L2,   12*f/L3,  -6*f/L2 ],
    [  6*f/L2,   2*f/L,    -6*f/L2,   4*f/L  ],
  ];
  const feq = [[ q*L/2 ], [ q*L*L/12 ], [ q*L/2 ], [ -q*L*L/12 ]];
  return { ke, feq };
}

function zeros(r,c){ return Array.from({length:r},()=>Array(c).fill(0)); }
function addSubmatrix(K, ke, map){ for(let a=0;a<map.length;a++) for(let b=0;b<map.length;b++) K[map[a]][map[b]] += ke[a][b]; }
function addSubvector(F, fe, map){ for(let a=0;a<map.length;a++) F[map[a]][0]+=fe[a][0]; }
function submatrix(A, rows, cols){ return rows.map(r=> cols.map(c=> A[r][c])); }
function subvector(v, rows){ return rows.map(r=> [v[r][0]]); }
function matVec(A, x){ return A.map(row=> row.reduce((s,aij,j)=>s+aij*x[j],0)); }
function solveLinear(A,b){
  const n=A.length; const M=A.map((row,i)=>[...row, b[i][0]]);
  for(let k=0;k<n;k++){
    let p=k; for(let i=k+1;i<n;i++) if(Math.abs(M[i][k])>Math.abs(M[p][k])) p=i;
    if (Math.abs(M[p][k])<1e-12) throw new Error('Singular matrix');
    if (p!==k){ const tmp=M[k]; M[k]=M[p]; M[p]=tmp; }
    const pivot=M[k][k];
    for(let j=k;j<=n;j++) M[k][j]/=pivot;
    for(let i=0;i<n;i++) if(i!==k){ const f=M[i][k]; for(let j=k;j<=n;j++) M[i][j]-=f*M[k][j]; }
  }
  const x = Array.from({length:n},()=>[0]);
  for(let i=0;i<n;i++) x[i][0]=M[i][n];
  return x;
}
function subMulAdd(A,x,b,sign){
  const m=A.length, n=x.length; const y=zeros(m,1);
  for(let i=0;i<m;i++){
    let s=0; for(let j=0;j<n;j++) s+=A[i][j]*x[j][0];
    y[i][0]=s + (sign||1)*(b[i]?.[0]||0);
  }
  return y;
}

// =====================================================
// 🔹 Start server
// =====================================================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
