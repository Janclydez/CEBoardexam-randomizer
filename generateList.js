// generateList.js
// Auto-creates psadquestions/list.json for static exam generator
// Supports shared q-files for both student/faculty, but detects f-files if present

const fs = require("fs");
const path = require("path");

const folder = path.join(__dirname, "psadquestions");

// ✅ Ensure folder exists
if (!fs.existsSync(folder)) {
  console.error("❌ Folder not found: psadquestions");
  console.error("Please make sure the 'psadquestions' folder exists beside this file.");
  process.exit(1);
}

// ✅ Read all .json files inside /psadquestions
const allFiles = fs
  .readdirSync(folder)
  .filter((f) => f.endsWith(".json") && f !== "list.json");

// Separate student & faculty files
const qFiles = allFiles.filter((f) => /^q\d+\.json$/i.test(f)).sort();
const fFiles = allFiles.filter((f) => /^f\d+\.json$/i.test(f)).sort();

// ✅ Dynamic logic
let student = qFiles;
let faculty;

// If f-files exist, use them for faculty; otherwise, share q-files
if (fFiles.length > 0) {
  faculty = fFiles;
  console.log(`👩‍🏫 Faculty mode detected: using ${fFiles.length} f-files.`);
} else {
  faculty = [...qFiles];
  console.log("👩‍🏫 Faculty mode uses same q-files as student mode.");
}

// ✅ Prepare list.json content
const list = { student, faculty };

// ✅ Write list.json inside /psadquestions
const outputPath = path.join(folder, "list.json");
fs.writeFileSync(outputPath, JSON.stringify(list, null, 2));

console.log("✅ list.json generated successfully!");
console.log(`   Student JSONs: ${student.length}`);
console.log(`   Faculty JSONs: ${faculty.length}`);
console.log(`📁 Output: ${outputPath}`);
