// ========= SITE-WIDE SMALL HELPERS (menu + dark mode) =========
function toggleMenu() {
  const m = document.getElementById("dropdownMenu");
  if (!m) return;
  m.style.display = (m.style.display === "block") ? "none" : "block";
}

function initDarkMode() {
  const body = document.body;
  const sw = document.getElementById("darkModeSwitch");
  if (!sw) return;

  // initial state from localStorage
  const saved = localStorage.getItem("ceboard_darkmode");
  if (saved === "dark") {
    body.classList.add("dark-mode");
    body.classList.remove("light-mode");
    sw.checked = true;
  } else {
    body.classList.add("light-mode");
    body.classList.remove("dark-mode");
    sw.checked = false;
  }

  sw.addEventListener("change", () => {
    if (sw.checked) {
      body.classList.add("dark-mode");
      body.classList.remove("light-mode");
      localStorage.setItem("ceboard_darkmode", "dark");
    } else {
      body.classList.add("light-mode");
      body.classList.remove("dark-mode");
      localStorage.setItem("ceboard_darkmode", "light");
    }
  });
}

// ========= LEVELING LOGIC =========

// read number or null
function readNumber(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const v = parseFloat(el.value);
  return isNaN(v) ? null : v;
}

// format without forcing 3 decimals; trim trailing zeros
function fmt(v) {
  if (v === null || v === undefined || !isFinite(v)) return "";
  let s = v.toFixed(6);           // good precision
  s = s.replace(/\.?0+$/, "");    // strip trailing zeros and dot
  return s;
}

function clearTableAndResults() {
  document.getElementById("inputArea").innerHTML = "";
  document.getElementById("results").innerHTML = "";
}

// build table for BS/FS
function generateTable() {
  const tpVal = document.getElementById("tpCount").value;
  const tpCount = parseInt(tpVal, 10);

  if (isNaN(tpCount) || tpCount < 1) {
    alert("Enter a valid number of turning points (at least 1).");
    return;
  }

  const lastIndex = tpCount + 1;        // BM2 index in FS list

  let html = `
    <table>
      <tr>
        <th>Station</th>
        <th>BS (m)</th>
        <th>FS (m)</th>
      </tr>
      <tr>
        <td><strong>BM1</strong></td>
        <td><input type="number" step="0.0001" id="bs0"></td>
        <td></td>
      </tr>
  `;

  for (let i = 1; i <= tpCount; i++) {
    html += `
      <tr>
        <td><strong>TP${i}</strong></td>
        <td><input type="number" step="0.0001" id="bs${i}"></td>
        <td><input type="number" step="0.0001" id="fs${i}"></td>
      </tr>
    `;
  }

  html += `
      <tr>
        <td><strong>BM2</strong></td>
        <td></td>
        <td><input type="number" step="0.0001" id="fs${lastIndex}"></td>
      </tr>
    </table>
  `;

  document.getElementById("inputArea").innerHTML = html;
  document.getElementById("results").innerHTML = "";
}

// main computation
function compute() {
  const tpVal = document.getElementById("tpCount").value;
  const tpCount = parseInt(tpVal, 10);
  if (isNaN(tpCount) || tpCount < 1) {
    alert("Enter a valid number of turning points and generate the table first.");
    return;
  }

  const elevBM1 = readNumber("elevBM1");
  if (elevBM1 === null) {
    alert("Enter the elevation of BM1 (benchmark).");
    return;
  }

  // station labels: BM1, TP1..TPn, BM2
  const stations = ["BM1"];
  for (let i = 1; i <= tpCount; i++) stations.push(`TP${i}`);
  stations.push("BM2");
  const nStations = stations.length;           // = tpCount + 2
  const lastIndex = nStations - 1;            // BM2 index

  const BS = new Array(nStations).fill(null);
  const FS = new Array(nStations).fill(null);
  const HI = new Array(nStations).fill(null);
  const Elev = new Array(nStations).fill(null);
  const EqHI = new Array(nStations).fill("");
  const EqElev = new Array(nStations).fill("");

  // read BS & FS
  BS[0] = readNumber("bs0"); // BM1 BS

  for (let i = 1; i <= tpCount; i++) {
    BS[i] = readNumber(`bs${i}`);
    FS[i] = readNumber(`fs${i}`);
  }
  FS[lastIndex] = readNumber(`fs${lastIndex}`); // BM2 FS

  // known elevation at BM1
  Elev[0] = elevBM1;
  EqElev[0] = "Given benchmark elevation = " + fmt(elevBM1);

  // formulas:
  // HI_AB = Elev_A + BS_A
  // Elev_B = Elev_A + BS_A - FS_B
  for (let i = 0; i <= nStations - 2; i++) {
    const elevA = Elev[i];
    const BSa   = BS[i];
    const FSb   = FS[i + 1];

    if (elevA !== null && BSa !== null) {
      const hi = elevA + BSa;
      HI[i] = hi;
      EqHI[i] = `${fmt(elevA)} + ${fmt(BSa)} = ${fmt(hi)}`;
    }

    if (elevA !== null && BSa !== null && FSb !== null) {
      const elevB = elevA + BSa - FSb;
      Elev[i + 1] = elevB;
      EqElev[i + 1] =
        `${fmt(elevA)} + ${fmt(BSa)} - ${fmt(FSb)} = ${fmt(elevB)}`;
    }
  }

  // build results table
  let html = `
    <table>
      <tr>
        <th>Station</th>
        <th>BS (m)</th>
        <th>HI (m)</th>
        <th>FS (m)</th>
        <th>Elevation (m)</th>
        <th>HI Computation</th>
        <th>Elevation Computation</th>
      </tr>
  `;

  for (let i = 0; i < nStations; i++) {
    html += `
      <tr>
        <td><strong>${stations[i]}</strong></td>
        <td>${fmt(BS[i])}</td>
        <td>${fmt(HI[i])}</td>
        <td>${fmt(FS[i])}</td>
        <td>${fmt(Elev[i])}</td>
        <td>${EqHI[i]}</td>
        <td>${EqElev[i]}</td>
      </tr>
    `;
  }

  html += `</table>`;

  document.getElementById("results").innerHTML = html;
}

// ========= INIT =========
window.addEventListener("DOMContentLoaded", () => {
  initDarkMode();

  const btnGen = document.getElementById("btnGenerate");
  const btnComp = document.getElementById("btnCompute");
  const btnClear = document.getElementById("btnClear");

  if (btnGen) btnGen.addEventListener("click", generateTable);
  if (btnComp) btnComp.addEventListener("click", compute);
  if (btnClear) btnClear.addEventListener("click", clearTableAndResults);
});
