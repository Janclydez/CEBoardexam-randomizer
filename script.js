/* =======================================================
   CE BOARD EXAM GENERATOR – STATIC VERSION (NO BACKEND)
   Uses psadquestions/list.json to auto-load question sets.
   Works fully on static hosting (e.g., Netlify).
   ======================================================= */

const adminPassword = 'cefaculty2025';
let isFacultyMode = false;
let examStartTime = null;

/* ======= Helper: Load file list ======= */
async function getQuestionFiles(isFaculty) {
  const list = await fetch("psadquestions/list.json").then(r => r.json());
  // Faculty mode uses the same files as student mode but renders differently
  return list.student && list.student.length > 0 ? list.student : [];
}

/* ======= Helper: Load questions ======= */
async function loadQuestions(selectedMainTags, selectedSubTags, count, isFaculty) {
  const files = await getQuestionFiles(isFaculty);
  const allData = await Promise.all(
    files.map(f => fetch(`psadquestions/${f}`).then(r => r.json()))
  );

  const matches = [];
  allData.flat().forEach(entry => {
    const matchMain = selectedMainTags.length === 0 || selectedMainTags.includes(entry.mainTag);
    const matchSub = selectedSubTags.length === 0 || selectedSubTags.includes(entry.subTag);
    if (matchMain && matchSub) {
      entry.subquestions?.forEach(sub => {
        sub.choices = sub.choices.sort(() => 0.5 - Math.random());
      });
      matches.push(entry);
    }
  });
  return matches.sort(() => 0.5 - Math.random()).slice(0, count);
}

/* ======= Tag fetching (client-side) ======= */
async function fetchTags() {
  const loadingNotice = document.getElementById('loadingNotice');
  if (loadingNotice) loadingNotice.style.display = 'block';
  try {
    const files = await getQuestionFiles(isFacultyMode);
    const allData = await Promise.all(files.map(f => fetch(`psadquestions/${f}`).then(r => r.json())));
    const mainTags = new Set(), subTags = new Set();
    allData.flat().forEach(entry => {
      if (entry.mainTag) mainTags.add(entry.mainTag);
      if (entry.subTag) subTags.add(entry.subTag);
    });

    const mainContainer = document.getElementById('mainTagContainer');
    const subContainer = document.getElementById('subTagContainer');
    mainContainer.innerHTML = '';
    subContainer.innerHTML = '';

    Array.from(mainTags).sort().forEach(tag => {
      const el = document.createElement('label');
      el.innerHTML = `<input type="checkbox" name="mainTag" value="${tag}" checked> ${tag}`;
      mainContainer.appendChild(el);
    });
    Array.from(subTags).sort().forEach(tag => {
      const el = document.createElement('label');
      el.innerHTML = `<input type="checkbox" name="subTag" value="${tag}" checked> ${tag}`;
      subContainer.appendChild(el);
    });

    setupMainTagControls();
    setupSubTagControls();
  } catch (e) {
    console.error(e);
    alert("⚠️ Failed to load tags. Check psadquestions/list.json accessibility.");
  } finally {
    if (loadingNotice) loadingNotice.style.display = 'none';
  }
}

/* ======= Tag Control Buttons ======= */
function getLabelTextForCheckbox(cb) {
  if (cb.nextSibling && cb.nextSibling.textContent) return cb.nextSibling.textContent.trim();
  return (cb.dataset?.tag || cb.value || cb.parentElement?.textContent || '').trim();
}
function createControlsBar(targetContainer, id, buttons) {
  let bar = document.getElementById(id);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = id;
    bar.className = 'tag-controls';
    targetContainer.parentElement.insertBefore(bar, targetContainer);
  }
  bar.innerHTML = '';
  buttons.forEach(({ text, onClick, title }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    if (title) btn.title = title;
    btn.className = 'tag-btn';
    btn.addEventListener('click', onClick);
    bar.appendChild(btn);
  });
}
function setupMainTagControls() {
  const cont = document.getElementById('mainTagContainer');
  const boxes = () => Array.from(cont.querySelectorAll('input[type="checkbox"]'));
  const selectAll = () => boxes().forEach(cb => (cb.checked = true));
  const deselectAll = () => boxes().forEach(cb => (cb.checked = false));
  const checkByPrefixExclusive = prefix => {
    const re = new RegExp(`^${prefix}\\b`, 'i');
    boxes().forEach(cb => cb.checked = re.test(getLabelTextForCheckbox(cb)));
  };
  createControlsBar(cont, 'mainTagControls', [
    { text: 'Select all (Main)', onClick: selectAll },
    { text: 'Deselect all (Main)', onClick: deselectAll },
    { text: 'Check MSTE Only', onClick: () => checkByPrefixExclusive('MSTE') },
    { text: 'Check PSAD Only', onClick: () => checkByPrefixExclusive('PSAD') },
    { text: 'Check HGE Only', onClick: () => checkByPrefixExclusive('HGE') }
  ]);
}
function setupSubTagControls() {
  const cont = document.getElementById('subTagContainer');
  const boxes = () => Array.from(cont.querySelectorAll('input[type="checkbox"]'));
  const selectAll = () => boxes().forEach(cb => (cb.checked = true));
  const deselectAll = () => boxes().forEach(cb => (cb.checked = false));
  createControlsBar(cont, 'subTagControls', [
    { text: 'Select all (Sub)', onClick: selectAll },
    { text: 'Deselect all (Sub)', onClick: deselectAll }
  ]);
}

/* ======= Image Zoom Overlay ======= */
function setupImageZoomOnce() {
  if (window.__zoomSetup) return;
  window.__zoomSetup = true;
  let overlay = document.getElementById('img-zoom-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'img-zoom-overlay';
    overlay.innerHTML = `
      <div class="zoom-hint" id="zoom-hint">Scroll to zoom</div>
      <img id="zoomed-img" alt="">
    `;
    document.body.appendChild(overlay);
  }
  const imgEl = overlay.querySelector('#zoomed-img');
  const hintEl = overlay.querySelector('#zoom-hint');
  let scale = 1, hintTimer;
  const MIN_SCALE = 0.05;
  const apply = () => imgEl.style.setProperty('--scale', scale);
  function showHint(ms = 1800) {
    clearTimeout(hintTimer);
    hintEl.classList.add('visible');
    hintTimer = setTimeout(() => hintEl.classList.remove('visible'), ms);
  }
  function openZoom(src) {
    imgEl.onload = () => { scale = 1; overlay.classList.add('show'); apply(); showHint(); };
    imgEl.src = src;
  }
  function closeZoom() { overlay.classList.remove('show'); imgEl.src = ''; }
  overlay.addEventListener('click', closeZoom);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeZoom(); });
  overlay.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = (e.deltaY > 0) ? 1 / 1.12 : 1.12;
    scale = Math.max(MIN_SCALE, scale * factor);
    apply(); hintEl.classList.remove('visible');
  }, { passive: false });
  imgEl.addEventListener('dblclick', () => { scale = 1; apply(); });
  document.addEventListener('click', e => {
    const thumb = e.target.closest('#exam-form .situation-container img');
    if (!thumb) return;
    e.preventDefault();
    if (overlay.classList.contains('show') && imgEl.src === thumb.src) { closeZoom(); return; }
    openZoom(thumb.src);
  });
}
document.addEventListener('DOMContentLoaded', setupImageZoomOnce);

/* ======= Expand/Shrink Button ======= */
function toggleExpandExam() {
  document.body.classList.toggle('exam-expanded');
  const btn = document.getElementById('expandExamBtn');
  if (btn) btn.textContent = document.body.classList.contains('exam-expanded') ? 'Shrink Exam' : 'Expand Exam';
}
function mountExpandButton() {
  const sidebar = document.getElementById('sidebar-controls');
  if (!sidebar || document.getElementById('expandExamBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'expandExamBtn';
  btn.textContent = 'Expand Exam';
  btn.addEventListener('click', toggleExpandExam);
  sidebar.insertBefore(btn, sidebar.firstChild);
}

/* ======= GA4 Event Bridge ======= */
function sendGA4EventToParent(eventName, params = {}) {
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'ga4-event', eventName, params }, '*');
  }
}
if (typeof gtag === 'function') {
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'ga4-event') {
      const evt = event.data;
      gtag('event', evt.eventName, evt.params);
    }
  });
}

/* ======= Main Logic ======= */
window.addEventListener('DOMContentLoaded', () => {
  const studentBtn = document.getElementById('studentModeBtn');
  const facultyBtn = document.getElementById('facultyModeBtn');
  const modeSelector = document.getElementById('modeSelector');
  const settingsContainer = document.getElementById('exam-settings');
  const toggleBtn = document.getElementById('toggleTrackerBtn');

  studentBtn.addEventListener('click', () => {
    isFacultyMode = false;
    modeSelector.style.display = 'none';
    settingsContainer.style.display = 'block';
    toggleBtn.style.display = 'block';
    fetchTags();
  });
  facultyBtn.addEventListener('click', () => {
    document.getElementById('facultyPasswordModal').style.display = 'block';
    document.getElementById('customFacultyPassword').value = '';
    document.getElementById('facultyPasswordError').style.display = 'none';
  });
  document.getElementById('facultyPasswordOk').addEventListener('click', () => {
    const entered = document.getElementById('customFacultyPassword').value;
    if (entered === adminPassword) {
      isFacultyMode = true;
      document.getElementById('facultyPasswordModal').style.display = 'none';
      modeSelector.style.display = 'none';
      settingsContainer.style.display = 'block';
      toggleBtn.style.display = 'none';
      fetchTags();
    } else {
      document.getElementById('facultyPasswordError').style.display = 'block';
    }
  });
  document.getElementById('facultyPasswordCancel').addEventListener('click', () => {
    document.getElementById('facultyPasswordModal').style.display = 'none';
  });
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const content = document.getElementById('sidebar-content');
      const isHidden = content.classList.toggle('hidden');
      toggleBtn.textContent = isHidden ? 'Show Controls' : 'Hide Controls';
    });
  }

  /* ===== Submit form and generate exam ===== */
  document.getElementById('exam-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const selectedMainTags = Array.from(document.querySelectorAll('input[name="mainTag"]:checked')).map(cb => cb.value);
    let selectedSubTags = Array.from(document.querySelectorAll('input[name="subTag"]:checked')).map(cb => cb.value);
    if (selectedSubTags.length === 0)
      selectedSubTags = Array.from(document.querySelectorAll('input[name="subTag"]')).map(cb => cb.value);
    const count = parseInt(document.getElementById('situationCount').value) || 1;
    const data = await loadQuestions(selectedMainTags, selectedSubTags, count, isFacultyMode);
    renderExam(data);
  });
});

/* ======= Render Exam ======= */
function renderExam(data) {
  const examLayout = document.getElementById('exam-layout');
  const form = document.getElementById('exam-form');
  const trackerBar = document.getElementById('situation-tracker-bar');
  const floatingScore = document.getElementById('floating-score');
  const submitBtn = document.getElementById('submit-btn');
  const sidebarControls = document.getElementById('sidebar-controls');

  examLayout.style.display = 'flex';
  form.innerHTML = '';
  trackerBar.innerHTML = '';
  floatingScore.innerHTML = '';
  submitBtn.style.display = isFacultyMode ? 'none' : 'block';
  sidebarControls.style.display = isFacultyMode ? 'none' : 'block';

  let globalNum = 1;
  const answerKey = [];

  data.forEach((situation, sIndex) => {
    const sDiv = document.createElement('div');
    sDiv.id = `situation-${sIndex}`;
    sDiv.classList.add('situation-container');
    sDiv.innerHTML = `<h3>Situation ${sIndex + 1}</h3><p>${situation.situation}</p>`;
    const imgContainer = document.createElement('div');

    ['a', 'b', 'c', 'd', 'e'].forEach(letter => {
      const img = new Image();
      img.src = `psadquestions/${situation.id}${letter}.png`;
      img.onload = () => imgContainer.appendChild(img);
      img.onerror = () => {};
    });
    sDiv.appendChild(imgContainer);

    situation.subquestions.forEach(sub => {
      const qId = `q${globalNum}`;
      const block = document.createElement('div');
      block.classList.add('question-block');
      block.innerHTML = `<p><b>${globalNum}. ${sub.question}</b></p>`;

      if (!isFacultyMode) {
        sub.choices.forEach(choice => {
          const box = document.createElement('div');
          box.classList.add('choice-box');
          box.innerHTML = choice;
          box.dataset.value = choice;
          box.setAttribute('name', qId);
          box.addEventListener('click', () => {
            document.querySelectorAll(`[name="${qId}"]`).forEach(el => el.classList.remove('selected'));
            box.classList.add('selected');
            hiddenInput.value = choice;
          });
          block.appendChild(box);
        });
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = `${qId}_hidden`;
        block.appendChild(hiddenInput);
        const feedback = document.createElement('p');
        feedback.classList.add('correct-answer');
        feedback.style.display = 'none';
        block.appendChild(feedback);
        answerKey.push({ id: qId, correct: sub.correctAnswer, situationIndex: sIndex });
      } else {
        const shuffled = [...sub.choices].sort(() => 0.5 - Math.random());
        shuffled.forEach((choice, i) => {
          const isCorrect = choice.trim() === sub.correctAnswer.trim();
          const p = document.createElement('p');
          const flag = isCorrect ? ' <span class="answer-flag">[ANS]</span>' : '';
          p.innerHTML = `<b>${String.fromCharCode(65 + i)}.</b> <span class="${isCorrect ? 'highlight-answer' : ''}">${choice}</span>${flag}`;
          block.appendChild(p);
        });
      }
      sDiv.appendChild(block);
      form.appendChild(sDiv);
      globalNum++;
    });

    if (!isFacultyMode) {
      const dot = document.createElement('div');
      dot.className = 'tracker-dot incomplete pulsing';
      dot.id = `tracker-${sIndex}`;
      dot.textContent = sIndex + 1;
      dot.onclick = () => {
        const target = document.getElementById(`situation-${sIndex}`);
        const yOffset = -80;
        const y = target.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      };
      trackerBar.appendChild(dot);
    }
  });

  submitBtn.onclick = () => {
    let score = 0;
    const situationScores = {};
    answerKey.forEach(q => {
      const selectedVal = document.querySelector(`input[name="${q.id}_hidden"]`)?.value;
      const choiceBoxes = document.querySelectorAll(`[name="${q.id}"]`);
      const feedback = choiceBoxes[0]?.closest('.question-block')?.querySelector('.correct-answer');
      const isCorrect = selectedVal === q.correct;
      situationScores[q.situationIndex] = situationScores[q.situationIndex] || { correct: 0, total: 0 };
      if (isCorrect) situationScores[q.situationIndex].correct++;
      situationScores[q.situationIndex].total++;
      choiceBoxes.forEach(box => {
        const wasSelected = box.classList.contains('selected');
        box.classList.remove('selected');
        if (box.dataset.value === q.correct) box.classList.add('correct');
        else if (wasSelected) box.classList.add('incorrect');
      });
      if (feedback) {
        feedback.innerHTML = `Correct answer: ${q.correct}`;
        feedback.style.display = 'block';
        if (window.MathJax) MathJax.typesetPromise([feedback]);
      }
      if (isCorrect) score++;
    });

    const timeTaken = Math.round((Date.now() - examStartTime) / 1000);
    const formatTime = s => `${Math.floor(s / 3600)}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
    floatingScore.innerHTML = `<h2>Score: ${score}/${answerKey.length}<br>⏱️ ${formatTime(timeTaken)}</h2>`;

    document.querySelectorAll('.tracker-dot').forEach((dot, i) => {
      const scoreData = situationScores[i];
      dot.classList.remove('incomplete', 'complete', 'partial', 'pulsing');
      if (!scoreData) dot.classList.add('incomplete');
      else if (scoreData.correct === scoreData.total) dot.classList.add('complete');
      else if (scoreData.correct === 0) dot.classList.add('incomplete');
      else dot.classList.add('partial');
    });

    if (typeof gtag === 'function')
      gtag('event', 'exam_completed', { event_category: 'Exam', event_label: 'Submitted', value: score });
    sendGA4EventToParent('exam_completed', { event_category: 'Exam', event_label: 'Submitted', value: score });
  };

  mountExpandButton();
  if (window.MathJax) MathJax.typesetPromise([form]);
  examStartTime = Date.now();
}
