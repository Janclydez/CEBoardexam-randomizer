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
          const letter = q.correct.trim()[0]; // Get 'A'
          const full = q.correct;
          return `<p style="margin: 4px 0;">${i + 1}. <b style="color:red">${letter}</b> - ${full}</p>`;
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
          
          const shuffled = [...sub.choices].sort(() => 0.5 - Math.random());
          shuffled.forEach((choice, i) => {
            const line = document.createElement('p');
            line.innerHTML = `<b>${String.fromCharCode(65 + i)}.</b> <span style="color: ${choice === sub.correctAnswer ? 'red' : 'inherit'}; font-weight: ${choice === sub.correctAnswer ? 'bold' : 'normal'}">${choice}</span>`;
            block.appendChild(line);
          });
          answerKey.push({ id: qId, correct: sub.correctAnswer, situationIndex: sIndex });
    
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

    examStartTime = Date.now();
  });
});
