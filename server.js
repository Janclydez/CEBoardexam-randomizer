const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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

// 🔹 Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

