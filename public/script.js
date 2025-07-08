
// ✅ Integrated version of script.js with:
//
// - Faculty mode renders choices in A.–D. block layout (not table)
// - Correct answer highlighted in RED only (no green highlight, no table borders)
// - Reveal Answer Key button (toggle)
// - Situation X bolded (already present)
// - Everything else retained

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
    form.innerHTML = '';
    trackerBar.innerHTML = '';
    floatingScore.innerHTML = '';
    submitBtn.style.display = isFacultyMode ? 'none' : 'block';
    submitBtn.disabled = false;
    sidebarControls.style.display = isFacultyMode ? 'none' : 'block';

    if (!isFacultyMode && toggleBtn) {
      toggleBtn.style.display = 'block';
      sidebarControls.appendChild(toggleBtn);
    }
    if (isFacultyMode && toggleBtn) toggleBtn.style.display = 'none';

    let globalNum = 1;
    let answerKey = [];

    data.forEach((situation, sIndex) => {
      const sDiv = document.createElement('div');
      sDiv.id = `situation-${sIndex}`;
      sDiv.classList.add('situation-container');
      sDiv.innerHTML += `<h3><b>Situation ${sIndex + 1}</b></h3><p>${situation.situation}</p>`;

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

            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = `${qId}_hidden`;
            block.appendChild(hiddenInput);

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

            const feedback = document.createElement('p');
            feedback.classList.add('correct-answer');
            feedback.style.display = 'none';
            block.appendChild(feedback);

            answerKey.push({ id: qId, correct: sub.correctAnswer, situationIndex: sIndex });
          });
        } else {
          const shuffled = [...sub.choices].sort(() => 0.5 - Math.random());
          shuffled.forEach((choice, i) => {
            const line = document.createElement('div');
            line.innerHTML = `<b>${String.fromCharCode(65 + i)}.</b> ${choice}`;
            if (choice === sub.correctAnswer) {
              line.style.color = 'red';
            }
            block.appendChild(line);
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

    // ✅ Reveal answer key button for faculty mode
    if (isFacultyMode) {
      const revealBtn = document.createElement('button');
      revealBtn.textContent = '📘 Reveal Answer Key';
      revealBtn.style.margin = '20px 0';
      revealBtn.style.padding = '10px 16px';
      revealBtn.style.fontWeight = 'bold';

      const answerDiv = document.createElement('div');
      answerDiv.style.display = 'none';
      answerDiv.style.marginTop = '10px';
      answerDiv.style.padding = '10px';
      answerDiv.style.border = '1px dashed #aaa';
      answerDiv.style.whiteSpace = 'pre-line';

      revealBtn.onclick = () => {
        answerDiv.style.display = answerDiv.style.display === 'none' ? 'block' : 'none';
        if (!answerDiv.textContent) {
          let counter = 1;
          let answerList = data.map(situation =>
            situation.subquestions.map(sub => {
              const correctIndex = sub.choices.findIndex(c => c === sub.correctAnswer);
              const letter = String.fromCharCode(65 + correctIndex);
              return `${counter++}. ${letter}`;
            }).join('\n')
          ).join('\n');
          answerDiv.textContent = answerList;
        }
      };

      form.prepend(answerDiv);
      form.prepend(revealBtn);
    }

    examStartTime = Date.now();
  });
});
