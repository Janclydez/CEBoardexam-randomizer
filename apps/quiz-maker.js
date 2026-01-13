// ---------- utilities ----------
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : ("id_" + Math.random().toString(16).slice(2));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ---------- state ----------
let quiz = null;
let currentIndex = 0;

// ---------- elements ----------
const numQuestions = document.getElementById("numQuestions");
const btnStart = document.getElementById("btnStart");
const btnGenerate = document.getElementById("btnGenerate");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const editor = document.getElementById("editor");
const output = document.getElementById("output");
const editorTitle = document.getElementById("editorTitle");

// ---------- init ----------
numQuestions.addEventListener("input", () => {
  numQuestions.value = clamp(parseInt(numQuestions.value || "1", 10), 1, 75);
});

btnStart.addEventListener("click", () => {
  const n = clamp(parseInt(numQuestions.value || "1", 10), 1, 75);

  quiz = {
    title: "Quiz",
    count: n,
    problems: Array.from({ length: n }, () => ({
      situation: "",
      images: [], // {id,name,dataUrl}
      subquestions: [makeSubquestion()]
    }))
  };

  currentIndex = 0;
  btnGenerate.disabled = false;
  btnPrev.disabled = false;
  btnNext.disabled = false;
  renderEditor();
  renderNavState();
});

btnPrev.addEventListener("click", () => {
  if (!quiz) return;
  currentIndex = clamp(currentIndex - 1, 0, quiz.count - 1);
  renderEditor();
  renderNavState();
});

btnNext.addEventListener("click", () => {
  if (!quiz) return;
  currentIndex = clamp(currentIndex + 1, 0, quiz.count - 1);
  renderEditor();
  renderNavState();
});

btnGenerate.addEventListener("click", () => {
  if (!quiz) return;
  renderOutputRandomized();
});

// ---------- builders ----------
function makeSubquestion() {
  return {
    question: "",
    choices: ["", "", "", ""],
    answerIndex: null
  };
}

// ---------- editor render ----------
function renderNavState() {
  if (!quiz) return;
  btnPrev.disabled = currentIndex === 0;
  btnNext.disabled = currentIndex === quiz.count - 1;
  editorTitle.textContent = `Editor — Problem ${currentIndex + 1} of ${quiz.count}`;
}

function renderEditor() {
  if (!quiz) return;
  const p = quiz.problems[currentIndex];

  editor.classList.remove("muted");
  editor.innerHTML = `
    <div class="field">
      <label>Problem / Situation</label>
      <textarea id="situationInput" placeholder="Type the main statement here..."></textarea>
    </div>

    <div class="field">
      <label>Upload Images (multiple)</label>
      <div class="imagesZone">
        <input id="imgInput" type="file" accept="image/*" multiple />
        <span class="small">Drag thumbnails to reorder</span>
      </div>
      <div id="thumbList" class="thumbList"></div>
    </div>

    <div class="field">
      <div class="row" style="justify-content:space-between;">
        <label style="margin:0;">Subquestions</label>
        <button id="addSubq" class="btn">+ Add Subquestion</button>
      </div>
      <div id="subqList"></div>
    </div>
  `;

  // set values
  const situationInput = document.getElementById("situationInput");
  situationInput.value = p.situation;
  situationInput.addEventListener("input", () => { p.situation = situationInput.value; });

  // images
  const imgInput = document.getElementById("imgInput");
  imgInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      // you can enforce size here, e.g. if (f.size > 2_000_000) continue;
      const dataUrl = await fileToDataUrl(f);
      p.images.push({ id: uid(), name: f.name, dataUrl });
    }
    imgInput.value = "";
    renderThumbs();
  });

  // subquestions
  document.getElementById("addSubq").addEventListener("click", () => {
    p.subquestions.push(makeSubquestion());
    renderSubqList();
  });

  renderThumbs();
  renderSubqList();
  renderNavState();

  // ----- nested renders -----
  function renderThumbs() {
    const thumbList = document.getElementById("thumbList");
    thumbList.innerHTML = p.images.map((img) => `
      <div class="thumb" draggable="true" data-id="${img.id}">
        <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" />
        <div class="meta">
          <span title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</span>
          <button class="btn" data-del="${img.id}">Remove</button>
        </div>
      </div>
    `).join("");

    // remove
    thumbList.querySelectorAll("button[data-del]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-del");
        p.images = p.images.filter(x => x.id !== id);
        renderThumbs();
      });
    });

    // drag reorder
    let dragId = null;

    thumbList.querySelectorAll(".thumb").forEach(node => {
      node.addEventListener("dragstart", (ev) => {
        dragId = node.getAttribute("data-id");
        ev.dataTransfer.effectAllowed = "move";
      });

      node.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
      });

      node.addEventListener("drop", (ev) => {
        ev.preventDefault();
        const dropId = node.getAttribute("data-id");
        if (!dragId || dragId === dropId) return;

        const from = p.images.findIndex(x => x.id === dragId);
        const to = p.images.findIndex(x => x.id === dropId);
        const [moved] = p.images.splice(from, 1);
        p.images.splice(to, 0, moved);

        dragId = null;
        renderThumbs();
      });
    });
  }

  function renderSubqList() {
    const subqList = document.getElementById("subqList");
    subqList.innerHTML = p.subquestions.map((sq, idx) => `
      <div class="subq" data-idx="${idx}">
        <div class="subqHead">
          <h3>Subquestion ${idx + 1}</h3>
          <div class="row" style="gap:8px;">
            <span class="small">Choices A–D</span>
            <button class="btn" data-remove-subq="${idx}" ${p.subquestions.length === 1 ? "disabled" : ""}>Remove</button>
          </div>
        </div>

        <div class="field" style="margin-top:10px;">
          <label>Question</label>
          <textarea data-q placeholder="Type the subquestion here..."></textarea>
        </div>

        <div class="choices">
          ${["A","B","C","D"].map((L, c) => `
            <div class="field">
              <label>${L}</label>
              <input type="text" data-choice="${c}" placeholder="Choice ${L}..." />
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");

    // bind inputs
    subqList.querySelectorAll(".subq").forEach(block => {
      const idx = parseInt(block.getAttribute("data-idx"), 10);
      const sq = p.subquestions[idx];

      const qta = block.querySelector("textarea[data-q]");
      qta.value = sq.question;
      qta.addEventListener("input", () => { sq.question = qta.value; });

      block.querySelectorAll("input[data-choice]").forEach(inp => {
        const c = parseInt(inp.getAttribute("data-choice"), 10);
        inp.value = sq.choices[c] ?? "";
        inp.addEventListener("input", () => { sq.choices[c] = inp.value; });
      });
    });

    // remove subq
    subqList.querySelectorAll("button[data-remove-subq]").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-remove-subq"), 10);
        if (p.subquestions.length <= 1) return;
        p.subquestions.splice(idx, 1);
        renderSubqList();
      });
    });
  }
}

// ---------- output render ----------
function renderOutputRandomized() {
  output.classList.remove("muted");

  // randomize problem order
  const randomizedProblems = shuffle(quiz.problems).map((p, probIdx) => {
    // randomize each subquestion choices (keeps text; if you later add answerIndex,
    // you must update it according to shuffle mapping)
    const subqs = p.subquestions.map(sq => {
      const labeled = sq.choices.map((t, i) => ({ i, t }));
      const shuffled = shuffle(labeled);
      return { question: sq.question, choices: shuffled.map(x => x.t) };
    });

    return {
      situation: p.situation,
      images: p.images,
      subquestions: subqs,
      number: probIdx + 1
    };
  });

  output.innerHTML = `
    <div class="paper">
      <h3>${escapeHtml(quiz.title)} — Generated Exam</h3>
      <div class="small">Questions: ${randomizedProblems.length} (order + choices randomized)</div>

      ${randomizedProblems.map(p => `
        <div class="prob">
          <div><b>Problem ${p.number}.</b> ${escapeHtml(p.situation)}</div>

          ${p.images.length ? `
            <div class="imgRow">
              ${p.images.map(img => `<img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" />`).join("")}
            </div>
          ` : ""}

          ${p.subquestions.map((sq, sidx) => `
            <div style="margin-top:10px;">
              <div><b>${p.number}.${sidx + 1}</b> ${escapeHtml(sq.question)}</div>
              <ol class="opts" type="A">
                ${sq.choices.map(ch => `<li>${escapeHtml(ch)}</li>`).join("")}
              </ol>
            </div>
          `).join("")}
        </div>
      `).join("")}
    </div>
  `;
}
