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

// ✅ Serve static images
app.use('/psadquestions', express.static(QUESTIONS_FOLDER));

/**
 * 🔹 GET /generate-faculty-exam
 * Returns shuffled f*.json questions with choices also shuffled
 */
app.get('/generate-faculty-exam', (req, res) => {
  try {
    const files = fs.readdirSync(FACULTY_FOLDER).filter(f => /^f\d+\.json$/.test(f));
    const situations = [];

    files.forEach(file => {
      const content = fs.readFileSync(path.join(FACULTY_FOLDER, file), 'utf-8');
      const parsed = JSON.parse(content);
      const id = path.parse(file).name;

      const entries = Array.isArray(parsed) ? parsed : [parsed];

      entries.forEach(situation => {
        situation.id = id;

        // Shuffle choices and keep correct answer
        situation.subquestions?.forEach(sub => {
          const correct = sub.correctAnswer;
          sub.choices = sub.choices.sort(() => 0.5 - Math.random());
          sub.correctAnswer = sub.choices.find(c => c === correct);
        });

        situations.push(situation);
      });
    });

    const shuffled = situations.sort(() => 0.5 - Math.random());

    res.json(shuffled);
  } catch (err) {
    console.error('❌ Error generating faculty exam:', err);
    res.status(500).send('Error reading faculty questions.');
  }
});

/**
 * 🔹 GET /tags
 * Returns all unique mainTags and subTags
 * Supports ?faculty=true to pull tags from f*.json files
 */
app.get('/tags', (req, res) => {
  const isFaculty = req.query.faculty === 'true';
  const folder = isFaculty ? FACULTY_FOLDER : QUESTIONS_FOLDER;
  const mainTags = new Set();
  const subTags = new Set();

  try {
    const targetFiles = fs.readdirSync(folder).filter(f => f.endsWith('.json'));

    targetFiles.forEach(file => {
      try {
        const content = fs.readFileSync(path.join(folder, file), 'utf-8');
        const data = JSON.parse(content);
        const entries = Array.isArray(data) ? data : [data];

        entries.forEach(entry => {
          if (entry.mainTag) mainTags.add(entry.mainTag);
          if (entry.subTag) subTags.add(entry.subTag);
        });
      } catch (err) {
        console.warn(`❌ Skipping invalid JSON in ${file}: ${err.message}`);
      }
    });

    res.json({
      mainTags: Array.from(mainTags).sort(),
      subTags: Array.from(subTags).sort()
    });
  } catch (err) {
    console.error('❌ Failed to read tags:', err.message);
    res.status(500).json({ error: 'Failed to load tags.' });
  }
});

/**
 * 🔹 GET /generate-exam
 * Standard user mode random exam generator
 */
app.get('/generate-exam', (req, res) => {
  const mainTags = req.query.mainTags?.split(',') || [];
  const subTags = req.query.subTags?.split(',') || [];
  const count = parseInt(req.query.count) || 1;

  try {
    const files = fs.readdirSync(QUESTIONS_FOLDER).filter(f => f.endsWith('.json') && !/^f\d+\.json$/.test(f));
    const matching = [];

    files.forEach(file => {
      try {
        const content = fs.readFileSync(path.join(QUESTIONS_FOLDER, file), 'utf-8');
        const data = JSON.parse(content);

        const matchMain = mainTags.length === 0 || mainTags.includes(data.mainTag);
        const matchSub = subTags.length === 0 || subTags.includes(data.subTag);

        if (matchMain && matchSub) matching.push(data);
      } catch (err) {
        console.warn(`❌ Skipping invalid JSON in ${file}: ${err.message}`);
      }
    });

    const selected = matching.sort(() => 0.5 - Math.random()).slice(0, count);

    selected.forEach(q => {
      q.subquestions?.forEach(sub => {
        sub.choices = sub.choices.sort(() => 0.5 - Math.random());
      });
    });

    res.json(selected);
  } catch (err) {
    console.error('❌ Failed to generate exam:', err.message);
    res.status(500).json({ error: 'Failed to generate exam.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
