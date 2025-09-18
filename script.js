const API_BASE = "https://ce-exam-generator.onrender.com";
const adminPassword = 'cefaculty2025';
let isFacultyMode = false;
let __examDataCache = null;              // holds the latest exam JSON
let __lastSettings = null;               // remember settings used to generate
let examStartTime = null;
/* ===== Image Zoom: self-initializing & delegated ===== */
function setupImageZoomOnce() {
  if (window.__zoomSetup) return;         // idempotent
  window.__zoomSetup = true;

  // Ensure overlay exists (create if missing)
  let overlay = document.getElementById('img-zoom-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'img-zoom-overlay';
    overlay.innerHTML = `
      <button class="zoom-close" aria-label="Close image">&times;</button>
      <img id="zoomed-img" alt="">
    `;
    document.body.appendChild(overlay);
  }
  const imgEl = overlay.querySelector('#zoomed-img');

  // State
  let scale = 1, tx = 0, ty = 0, dragging = false, startX = 0, startY = 0;

  function applyTransform() {
    imgEl.style.setProperty('--scale', scale);
    imgEl.style.setProperty('--tx', `${tx}px`);
    imgEl.style.setProperty('--ty', `${ty}px`);
  }
  function openZoom(src) {
    scale = 1; tx = 0; ty = 0;
    imgEl.src = src;
    overlay.classList.add('show');
    applyTransform();
  }
  function closeZoom() {
    overlay.classList.remove('show');
    imgEl.src = '';
  }

  // Close actions
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('zoom-close')) closeZoom();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeZoom(); });

  // Pan
  imgEl.addEventListener('mousedown', (e) => {
    dragging = true; startX = e.clientX - tx; startY = e.clientY - ty;
    imgEl.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    tx = e.clientX - startX;
    ty = e.clientY - startY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    dragging = false; imgEl.style.cursor = 'grab';
  });

  // Wheel zoom (cursor-centered)
  overlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 0.15;
    const newScale = Math.min(5, Math.max(1, scale + delta));
    if (newScale !== scale) {
      const rect = imgEl.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top  - rect.height / 2;
      tx -= cx * (newScale/scale - 1);
      ty -= cy * (newScale/scale - 1);
      scale = newScale;
      applyTransform();
    }
  }, { passive: false });

  // Double-click to reset
  imgEl.addEventListener('dblclick', () => { scale = 1; tx = 0; ty = 0; applyTransform(); });

  // Delegated click: ANY image inside situations opens zoom (works across re-renders)
  document.addEventListener('click', (e) => {
    const img = e.target.closest('#exam-form .situation-container img');
    if (!img) return;
    e.preventDefault();
    openZoom(img.src);
  });
}

// Initialize once on page load
document.addEventListener('DOMContentLoaded', setupImageZoomOnce);

/* ===== Expand/Shrink Exam ===== */
function toggleExpandExam() {
  document.body.classList.toggle('exam-expanded');
  const btn = document.getElementById('expandExamBtn');
  if (btn) btn.textContent = document.body.classList.contains('exam-expanded')
    ? 'Shrink Exam'
    : 'Expand Exam';
}

function mountExpandButton() {
  // Put the button inside the sidebar, above Hide Controls
  const sidebar = document.getElementById('sidebar-controls');
  if (!sidebar || document.getElementById('expandExamBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'expandExamBtn';
  btn.type = 'button';
  btn.textContent = document.body.classList.contains('exam-expanded') ? 'Shrink Exam' : 'Expand Exam';
  btn.addEventListener('click', toggleExpandExam);
  sidebar.insertBefore(btn, sidebar.firstChild);
}


// ---- Tag controls (buttons) ----
function createControlsBar(targetContainer, id, buttons) {
  let bar = document.getElementById(id);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = id;
    bar.className = 'tag-controls';
    // insert the bar right above the container
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

// ==== Tag controls (buttons) ====

// Small util to read the visible label text for a checkbox
function getLabelTextForCheckbox(cb) {
  // try label text right after the input
  if (cb.nextSibling && cb.nextSibling.textContent) {
    return cb.nextSibling.textContent.trim();
  }
  // fallback: use data-tag or value or parent text
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

  const checkByPrefixExclusive = (prefix) => {
    const re = new RegExp(`^${prefix}\\b`, 'i');
    boxes().forEach(cb => {
      const label = getLabelTextForCheckbox(cb);
      cb.checked = re.test(label);
    });
  };

  createControlsBar(cont, 'mainTagControls', [
    { text: 'Select all (Main)',   onClick: selectAll },
    { text: 'Deselect all (Main)', onClick: deselectAll },
    { text: 'Check MSTE Only', title: 'Only MSTE main tags remain checked', onClick: () => checkByPrefixExclusive('MSTE') },
    { text: 'Check PSAD Only', title: 'Only PSAD main tags remain checked', onClick: () => checkByPrefixExclusive('PSAD') },
    { text: 'Check HGE Only',  title: 'Only HGE main tags remain checked',  onClick: () => checkByPrefixExclusive('HGE') },
  ]);
}

function setupSubTagControls() {
  const cont = document.getElementById('subTagContainer');
  const boxes = () => Array.from(cont.querySelectorAll('input[type="checkbox"]'));
  const selectAll = () => boxes().forEach(cb => (cb.checked = true));
  const deselectAll = () => boxes().forEach(cb => (cb.checked = false));

  createControlsBar(cont, 'subTagControls', [
    { text: 'Select all (Sub)',   onClick: selectAll },
    { text: 'Deselect all (Sub)', onClick: deselectAll },
  ]);
}


function fetchTags() {
const tagURL = `${API_BASE}/tags`;
  fetch(tagURL)
    .then(res => res.json())
    .then(({ mainTags, subTags }) => {
      const mainContainer = document.getElementById('mainTagContainer');
      const subContainer = document.getElementById('subTagContainer');
      mainContainer.innerHTML = '';
      subContainer.innerHTML = '';

      mainTags.forEach(tag => {
        const el = document.createElement('label');
        el.innerHTML = `<input type="checkbox" name="mainTag" value="${tag}" checked> ${tag}`;
        el.style.display = 'block';
        el.style.textAlign = 'left';
        mainContainer.appendChild(el);
      });

      subTags.forEach(tag => {
        const el = document.createElement('label');
        el.innerHTML = `<input type="checkbox" name="subTag" value="${tag}" checked> ${tag}`;
        el.style.display = 'block';
        el.style.textAlign = 'left';
        subContainer.appendChild(el);
      });
      setupMainTagControls();
      setupSubTagControls();

    })
    .catch(err => console.error('Failed to load tags:', err));
}

function sendGA4EventToParent(eventName, params = {}) {
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'ga4-event',
      eventName,
      params
    }, '*');
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

  document.getElementById('exam-settings').addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedMainTags = Array.from(document.querySelectorAll('input[name="mainTag"]:checked')).map(cb => cb.value);
    let selectedSubTags = Array.from(document.querySelectorAll('input[name="subTag"]:checked')).map(cb => cb.value);
    if (selectedSubTags.length === 0) {
      selectedSubTags = Array.from(document.querySelectorAll('input[name="subTag"]')).map(cb => cb.value);
    }

    const count = document.getElementById('situationCount').value;
  const endpoint = `${API_BASE}/generate-exam?mainTags=${selectedMainTags.join(',')}&subTags=${selectedSubTags.join(',')}&count=${count}`;


    const response = await fetch(endpoint);
    const data = await response.json();

    const examLayout = document.getElementById('exam-layout');
    const form = document.getElementById('exam-form');
    const trackerBar = document.getElementById('situation-tracker-bar');
    const floatingScore = document.getElementById('floating-score');
    const submitBtn = document.getElementById('submit-btn');
    const sidebarControls = document.getElementById('sidebar-controls');

    examLayout.style.display = 'flex';
    form.innerHTML = '';
  if (isFacultyMode) {
  const revealBtn = document.createElement('button');
  revealBtn.textContent = 'Reveal Answer Key';
  revealBtn.style.marginBottom = '20px';
  revealBtn.style.padding = '8px 16px';
  revealBtn.style.backgroundColor = '#18398A';
  revealBtn.style.color = 'white';
  revealBtn.style.border = 'none';
  revealBtn.style.borderRadius = '6px';
  revealBtn.style.cursor = 'pointer';

  revealBtn.onclick = (e) => {
    e.preventDefault(); // ✅ Prevent form submission

    let keyDiv = document.getElementById('answer-key-list');
    if (!keyDiv) {
      keyDiv = document.createElement('div');
      keyDiv.id = 'answer-key-list';
      keyDiv.innerHTML = '<h3 style="margin-bottom: 10px;">Answer Key</h3>' + 
        answerKey.map((q, i) => {
        const index = q.choices.findIndex(c => c.trim() === q.correct.trim());
        const letter = ['A', 'B', 'C', 'D'][index] || '?';
        return `<p style="margin: 4px 0;"><b>${i + 1}. <span style="color: red">${letter}</span></b> - ${q.correct}</p>`;
      }).join('');

      if (typeof form !== 'undefined' && form.prepend) {
        form.prepend(keyDiv);
      }
    }
  };

  if (typeof form !== 'undefined' && form.prepend) {
    form.prepend(revealBtn);
  }
}


    
    trackerBar.innerHTML = '';
    floatingScore.innerHTML = '';
    submitBtn.style.display = isFacultyMode ? 'none' : 'block';
    submitBtn.disabled = false;
    sidebarControls.style.display = isFacultyMode ? 'none' : 'block';

   if (!isFacultyMode && toggleBtn) {
  toggleBtn.style.display = 'block';
  sidebarControls.appendChild(toggleBtn); // ✅ Correct placement inside sidebar
}
    if (isFacultyMode && toggleBtn) toggleBtn.style.display = 'none';

    let globalNum = 1;
    let answerKey = [];

    data.forEach((situation, sIndex) => {
      const sDiv = document.createElement('div');
      sDiv.id = `situation-${sIndex}`;
      sDiv.classList.add('situation-container');
      sDiv.innerHTML += `<h3>Situation ${sIndex + 1}</h3><p>${situation.situation}</p>`;

      const imageContainer = document.createElement('div');
      sDiv.appendChild(imageContainer);

['a', 'b', 'c', 'd', 'e'].forEach(letter => {
  const img = new Image();
img.src = `${API_BASE}/psadquestions/${situation.id}${letter}.png`;
  img.onload = () => {
    img.style.maxWidth = "100%";
    img.style.margin = "10px 0";
    img.style.borderRadius = "10px";
    imageContainer.appendChild(img);
  };
  // Optional: silently ignore missing images
  img.onerror = () => {};
});

      situation.subquestions.forEach((sub, qIndex) => {
        const qId = `q${globalNum}`;
        const block = document.createElement('div');
        block.classList.add('question-block');

        const questionP = document.createElement('p');
        questionP.innerHTML = `<b>${globalNum}. ${sub.question}</b>`;
        block.appendChild(questionP);

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

              const situationDiv = document.getElementById(`situation-${sIndex}`);
              const inputs = situationDiv.querySelectorAll('input[type="hidden"]');
              const answered = Array.from(inputs).filter(input => input.value).length;
              const dot = document.getElementById(`tracker-${sIndex}`);
              dot.classList.remove('complete', 'incomplete', 'partial', 'pulsing');
              if (answered === inputs.length) dot.classList.add('partial');
              else dot.classList.add('incomplete', 'pulsing');

              const allAnswered = Array.from(document.querySelectorAll('input[type="hidden"]')).every(input => input.value);
              if (allAnswered) {
                document.querySelectorAll('.tracker-dot').forEach(dot => dot.classList.remove('pulsing'));
              }
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
  // FACULTY MODE: shuffle; show correct text in red + add a removable [ANS] tag
  const shuffled = [...sub.choices].sort(() => 0.5 - Math.random());

  shuffled.forEach((choice, i) => {
    const isCorrect = choice.trim() === sub.correctAnswer.trim();
    const line = document.createElement('p');

    // The [ANS] tag is the quick-removal marker for Word
    const flag = isCorrect ? ' <span class="answer-flag">[ANS]</span>' : '';

    line.innerHTML =
      `<b>${String.fromCharCode(65 + i)}.</b> ` +
      `<span class="${isCorrect ? 'highlight-answer' : ''}">${choice}</span>` +
      flag;

    block.appendChild(line);
  });

  answerKey.push({
    id: qId,
    correct: sub.correctAnswer,
    situationIndex: sIndex,
    choices: shuffled
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
      if (isFacultyMode) return;

      submitBtn.disabled = true;
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
          if (box.dataset.value === q.correct) {
            box.classList.add('correct');
          } else if (wasSelected) {
            box.classList.add('incorrect');
          }
        });

   if (feedback) {
  feedback.innerHTML = `Correct answer: ${q.correct}`;
  feedback.style.display = 'block';

  // ✅ Re-render MathJax for this single feedback block
  if (window.MathJax) {
    MathJax.typesetPromise([feedback]);
  }
}


        if (isCorrect) score++;
      });

      const timeTaken = Math.round((Date.now() - examStartTime) / 1000);
      const formatTime = (s) => `${Math.floor(s / 3600)}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
      floatingScore.innerHTML = `<h2>Score: ${score} / ${answerKey.length}<br>⏱️ Time: ${formatTime(timeTaken)}</h2>`;

      document.querySelectorAll('.tracker-dot').forEach((dot, index) => {
        const scoreData = situationScores[index];
        dot.classList.remove('incomplete', 'complete', 'partial', 'pulsing');
        if (!scoreData) dot.classList.add('incomplete');
        else if (scoreData.correct === scoreData.total) dot.classList.add('complete');
        else if (scoreData.correct === 0) dot.classList.add('incomplete');
        else dot.classList.add('partial');
      });
      // ✅ Append solution links per situation (user mode only)
if (!isFacultyMode) {
  data.forEach((situation, sIndex) => {
    const sol = situation.resources;
    if (!sol) return;

    const sDiv = document.getElementById(`situation-${sIndex}`);
    const solDiv = document.createElement('div');
    solDiv.style.marginTop = '20px';
    solDiv.innerHTML = `
      <h4 style="color:#18398A; margin:10px 0 5px;">📘 Solution Links</h4>
      <ul style="line-height: 1.7; font-size: 15px;">
        ${sol.youtube ? `<li><a href="${sol.youtube}" target="_blank">▶️ YouTube Video</a></li>` : ''}
        ${sol.facebook ? `<li><a href="${sol.facebook}" target="_blank">📘 Facebook Post</a></li>` : ''}
        ${sol.website ? `<li><a href="${sol.website}" target="_blank">🌐 Website Solution</a></li>` : ''}
      </ul>
    `;
    sDiv.appendChild(solDiv);
  });
}


      if (typeof gtag === 'function') {
        gtag('event', 'exam_completed', {
          event_category: 'Exam',
          event_label: 'Exam Submitted',
          value: score
        });
      }

      sendGA4EventToParent('exam_completed', {
        event_category: 'Exam',
        event_label: 'Exam Submitted',
        value: score
      });
    };
    // ✅ Render MathJax equations after all HTML is inserted
  if (window.MathJax) {
  const container = document.getElementById('exam-form');
  MathJax.typesetClear([container]);
  MathJax.typesetPromise([container])
    .then(() => console.log("✅ MathJax rendered"))
    .catch(err => console.error("❌ MathJax error:", err));
}

// Add the expand/shrink button and enable click-to-zoom on images
mountExpandButton();


    examStartTime = Date.now();
  });
});
