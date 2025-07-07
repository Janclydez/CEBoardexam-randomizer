const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

const QUESTIONS_FOLDER = path.join(__dirname, 'psadquestions');
const FACULTY_FOLDER = path.join(__dirname, 'psadquestions/faculty');

// ✅ Serve static images
app.use('/psadquestions', express.static(QUESTIONS_FOLDER));

/**
 * 🔹 GET /generate-faculty-exam
 * Returns only files starting with f (e.g., f1.json, f2.json)
 */
app.get('/generate-faculty-exam', (req, res) => {
  try {
    const files = fs.readdirSync(FACULTY_FOLDER).filter(f => /^f\d+\.json$/.test(f));
    const situations = [];

    files.forEach(file => {
      const content = fs.readFileSync(path.join(FACULTY_FOLDER, file), 'utf-8');
      const parsed = JSON.parse(content);
      const id = path.parse(file).name;

      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          item.id = id;
          situations.push(item);
        });
      } else {
        parsed.id = id;
        situations.push(parsed);
      }
    });

    // Shuffle output
    const shuffled = situations.sort(() => 0.5 - Math.random());

    res.json(shuffled);
  } catch (err) {
    console.error('❌ Error generating faculty exam:', err);
    res.status(500).send('Error reading faculty questions.');
  }
});

/**
 * 🔹 GET /tags
 * Returns all unique mainTags and subTags from user-mode JSONs
 */
app.get('/tags', (req, res) => {
  const mainTags = new Set();
  const subTags = new Set();

  try {
    const files = fs.readdirSync(QUESTIONS_FOLDER).filter(f => f.endsWith('.json'));

    files.forEach(file => {
      const fullPath = path.join(QUESTIONS_FOLDER, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const data = JSON.parse(content);
        if (data.mainTag) mainTags.add(data.mainTag);
        if (data.subTag) subTags.add(data.subTag);
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
 * Random user-mode exam based on selected tags
 */
app.get('/generate-exam', (req, res) => {
  const mainTags = req.query.mainTags?.split(',') || [];
  const subTags = req.query.subTags?.split(',') || [];
  const count = parseInt(req.query.count) || 1;

  try {
    const files = fs.readdirSync(QUESTIONS_FOLDER).filter(f => f.endsWith('.json'));
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
