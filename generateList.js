// generateList.js
// Auto-creates psadquestions/list.json for static exam generator

const fs = require('fs');
const path = require('path');

const folder = path.join(__dirname, 'psadquestions');

// Read all .json files inside /psadquestions
const allFiles = fs.readdirSync(folder).filter(f => f.endsWith('.json'));

// Classify files: student = q1.json, q2.json, etc. | faculty = f1.json, f2.json, etc.
const student = allFiles.filter(f => !/^f\d+\.json$/i.test(f)).sort();
const faculty = allFiles.filter(f => /^f\d+\.json$/i.test(f)).sort();

// Prepare list.json content
const list = { student, faculty };

// Write list.json inside /psadquestions
fs.writeFileSync(
  path.join(folder, 'list.json'),
  JSON.stringify(list, null, 2)
);

console.log(`✅ list.json generated successfully!`);
console.log(`   ${student.length} student JSONs`);
console.log(`   ${faculty.length} faculty JSONs`);
