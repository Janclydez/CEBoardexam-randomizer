const adminPassword = 'cefaculty2025';
let isFacultyMode = false;

function openFacultyModal() {
  document.getElementById('facultyModal').style.display = 'block';
}
function closeFacultyModal() {
  document.getElementById('facultyModal').style.display = 'none';
}
function submitFacultyLogin() {
  const input = document.getElementById('facultyPassword').value;
  const loginBtn = document.getElementById('faculty-login-btn');
  const statusLabel = document.getElementById('facultyStatus');

  if (input === adminPassword) {
    isFacultyMode = true;
    loginBtn.disabled = true;
    loginBtn.textContent = 'Faculty Mode Enabled';
    loginBtn.style.backgroundColor = 'gray';
    closeFacultyModal();
    statusLabel.textContent = 'Faculty Mode Enabled';
    statusLabel.style.color = 'green';
    fetchTags(); // ✅ Re-fetch tags for faculty
  } else {
    statusLabel.textContent = 'Incorrect Password';
    statusLabel.style.color = 'red';
    setTimeout(() => { statusLabel.textContent = ''; }, 2000);
  }
}

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
        mainContainer.appendChild(el);
      });

      subTags.forEach(tag => {
        const el = document.createElement('label');
        el.innerHTML = `<input type="checkbox" name="subTag" value="${tag}" checked> ${tag}`;
        el.style.display = 'block';
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

let examStartTime = null;

window.addEventListener('DOMContentLoaded', async () => {
  fetchTags();

  const sidebar = document.getElementById('sidebar-controls');
  if (sidebar) {
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggle-sidebar';
    toggleBtn.textContent = 'Hide Controls';
    Object.assign(toggleBtn.style, {
      marginTop: '10px',
      padding: '6px 12px',
      borderRadius: '6px',
      border: 'none',
      backgroundColor: '#ccc',
      cursor: 'pointer',
      fontSize: '0.85rem'
    });
    sidebar.appendChild(toggleBtn);
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      toggleBtn.textContent = sidebar.classList.contains('collapsed') ? 'Show Controls' : 'Hide Controls';
    });
  }

  const loginBtn = document.createElement('button');
  loginBtn.textContent = 'Faculty Login';
  loginBtn.id = 'faculty-login-btn';
  Object.assign(loginBtn.style, {
    margin: '10px',
    padding: '6px 12px',
    backgroundColor: '#4A4E69',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem'
  });

  loginBtn.onclick = () => openFacultyModal();
  const settingsContainer = document.getElementById('exam-settings');
  if (settingsContainer && !document.getElementById('faculty-login-btn')) {
    settingsContainer.appendChild(loginBtn);
  }
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
    ? '/generate-faculty-exam'
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
  sidebarControls.style.display = isFacultyMode ? 'none' : 'flex';
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
        [...sub.choices].sort(() => 0.5 - Math.random()).forEach((c, i) => {
          const p = document.createElement('p');
          p.innerHTML = `${String.fromCharCode(65 + i)}. ${c}`;
          if (c === sub.correctAnswer) {
            p.style.fontWeight = 'bold';
            p.style.backgroundColor = '#d4edda';
            p.style.border = '1px solid #c3e6cb';
            p.style.padding = '6px';
            p.style.borderRadius = '6px';
          }
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

  // Submit logic – only runs for user mode
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
