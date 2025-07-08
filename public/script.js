const adminPassword = 'cefaculty2025';
let isFacultyMode = false;
let examStartTime = null;

function fetchTags() {
  const tagURL = isFacultyMode ? '/tags?faculty=true' : '/tags';
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

  studentBtn.addEventListener('click', () => {
    isFacultyMode = false;
    modeSelector.style.display = 'none';
    settingsContainer.style.display = 'block';
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
      fetchTags();
    } else {
      document.getElementById('facultyPasswordError').style.display = 'block';
    }
  });

  document.getElementById('facultyPasswordCancel').addEventListener('click', () => {
    document.getElementById('facultyPasswordModal').style.display = 'none';
  });

  document.getElementById('exam-settings').addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedMainTags = Array.from(document.querySelectorAll('input[name="mainTag"]:checked')).map(cb => cb.value);
    let selectedSubTags = Array.from(document.querySelectorAll('input[name="subTag"]:checked')).map(cb => cb.value);
    if (selectedSubTags.length === 0) {
      selectedSubTags = Array.from(document.querySelectorAll('input[name="subTag"]')).map(cb => cb.value);
    }

    const count = document.getElementById('situationCount').value;
    const endpoint = isFacultyMode
      ? `/generate-faculty-exam?mainTags=${selectedMainTags.join(',')}&subTags=${selectedSubTags.join(',')}&count=${count}`
      : `/generate-exam?mainTags=${selectedMainTags.join(',')}&subTags=${selectedSubTags.join(',')}&count=${count}`;

    const response = await fetch(endpoint);
    const data = await response.json();

    const examLayout = document.getElementById('exam-layout');
    const form = document.getElementById('exam-form');
    const trackerBar = document.getElementById('situation-tracker-bar');
    const floatingScore = document.getElementById('floating-score');
    const submitBtn = document.getElementById('submit-btn');
    const sidebarControls = document.getElementById('sidebar-controls');

    examLayout.style.display = 'flex';
    sidebarControls.style.right = '0';
    const toggleBtn = document.getElementById('toggleTrackerBtn');
    if (!isFacultyMode && toggleBtn) {
      toggleBtn.style.display = 'block';
      toggleBtn.textContent = 'Hide Controls';
    } else if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }

    form.innerHTML = '';
    trackerBar.innerHTML = '';
    floatingScore.innerHTML = '<h2>Score: - / -</h2>';
    submitBtn.disabled = false;
    submitBtn.style.display = isFacultyMode ? 'none' : 'block';

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
        img.src = isFacultyMode
          ? `psadquestions/faculty/${situation.id}${letter}.png`
          : `psadquestions/${situation.id}${letter}.png`;
        img.onload = () => {
          img.style.maxWidth = "100%";
          img.style.margin = "10px 0";
          img.style.borderRadius = "10px";
          imageContainer.appendChild(img);
        };
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
              if (answered === inputs.length) {
                dot.classList.add('partial');
              } else {
                dot.classList.add('incomplete', 'pulsing');
              }

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
          const choiceTable = document.createElement('div');
          choiceTable.style.display = 'grid';
          choiceTable.style.gridTemplateColumns = '1fr 1fr';
          choiceTable.style.gap = '8px 24px';

          const randomizedChoices = [...sub.choices].sort(() => 0.5 - Math.random());
          randomizedChoices.forEach((c, i) => {
            const p = document.createElement('div');
            p.innerHTML = `${String.fromCharCode(65 + i)}. ${c}`;
            p.style.padding = '8px';
            if (c === sub.correctAnswer) {
              p.style.fontWeight = 'bold';
              p.style.backgroundColor = '#d4edda';
              p.style.border = '1px solid #c3e6cb';
              p.style.borderRadius = '6px';
            }
            choiceTable.appendChild(p);
          });
          block.appendChild(choiceTable);
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

    // Show/hide controls toggle
    const trackerToggleBtn = document.getElementById('toggleTrackerBtn');
    if (trackerToggleBtn) {
      trackerToggleBtn.onclick = () => {
        const sidebar = document.getElementById('sidebar-controls');
        const isHidden = sidebar.style.right === '-220px';
        sidebar.style.right = isHidden ? '0' : '-220px';
        trackerToggleBtn.textContent = isHidden ? 'Hide Controls' : 'Show Controls';
      };
    }

    submitBtn.onclick = () => { /* unchanged */ };
    examStartTime = Date.now();
  });
});
