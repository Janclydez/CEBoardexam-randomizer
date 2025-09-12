const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
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







// Serve the Beam Modeler UI at /beam-modeler
app.use('/beam-modeler', express.static(path.join(__dirname, 'public/beam-modeler')));


// Health
app.get('/health', (_,res)=>res.json({ok:true}));


// ---- FEM Solver API -------------------------------------------------------
// Body schema: { nodes:[x0,x1,...], elements:[{i,j,E,I,q}], supports:[{node,type}], loads:{Fy:{node:value}, Mz:{node:value}} }
// - nodes: array of x positions (ascending)
// - elements: connect node indices i->j (consecutive or not), with E (kN/m^2), I (m^4), optional q (kN/m, downward +)
// - supports.type: 'fixed' | 'pin' | 'roller' | 'free' (pin==roller in 1D)
// - loads.Fy: nodal vertical force (down +)
// - loads.Mz: nodal moment (CCW +)
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


// ---------------- FEM Core (Euler–Bernoulli beam) --------------------------
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
const n = parseInt(nodeStr,10);
F[2*n + 0][0] += val; // vertical force
});
if (loads && loads.Mz) Object.entries(loads.Mz).forEach(([nodeStr, val]) => {
const n = parseInt(nodeStr,10);
F[2*n + 1][0] += val; // moment
});


// Element assembly
const eData = elements.map((e)=>{
const xi = nodes[e.i], xj = nodes[e.j];
const L = Math.abs(xj - xi);
if (L <= 0) throw new Error('Element with zero/negative length');
const { ke, feq } = beamElement(e.E, e.I, L, e.q || 0);
// assemble
const map = [2*e.i, 2*e.i+1, 2*e.j, 2*e.j+1];
addSubmatrix(K, ke, map);
addSubvector(F, feq, map);
return { ...e, L, map };
});



// 🔹 Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

