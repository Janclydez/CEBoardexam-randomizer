// Bridge to Parent GA4
function sendGA4EventToParent(eventName, params = {}) {
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'ga4-event',
      eventName,
      params
    }, '*');
  }
}

// GA4 Event Receiver for iframe (for standalone testing)
if (typeof gtag === 'function') {
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'ga4-event') {
      const evt = event.data;
      gtag('event', evt.eventName, evt.params);
    }
  });
}

// 1. Load available tags dynamically on page load
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/tags');
    const { mainTags, subTags } = await res.json();

    const mainContainer = document.getElementById('mainTagContainer');
    const subContainer = document.getElementById('subTagContainer');

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
  } catch (err) {
    console.error('Failed to load tags:', err);
  }

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'toggle-sidebar';
  toggleBtn.textContent = 'Hide Controls';
  toggleBtn.style.marginTop = '10px';
  toggleBtn.style.padding = '6px 12px';
  toggleBtn.style.borderRadius = '6px';
  toggleBtn.style.border = 'none';
  toggleBtn.style.backgroundColor = '#ccc';
  toggleBtn.style.cursor = 'pointer';
  toggleBtn.style.fontSize = '0.85rem';

  const sidebar = document.getElementById('sidebar-controls');
  if (sidebar) {
    sidebar.appendChild(toggleBtn);
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      toggleBtn.textContent = sidebar.classList.contains('collapsed') ? 'Show Controls' : 'Hide Controls';
    });
  }
});

let examStartTime = null;

const adminPassword = 'cefaculty2025';
let isFacultyMode = false;

// Listen for password change
const adminInput = document.getElementById('adminPassword');
if (adminInput) {
  adminInput.addEventListener('input', (e) => {
    const value = e.target.value;
    isFacultyMode = value === adminPassword;
  });
}

// Modify main form logic
const formElem = document.getElementById('exam-settings');
if (formElem) {
  formElem.addEventListener('submit', async (e) => {
    e.preventDefault();

    const examLayout = document.getElementById('exam-layout');
    const form = document.getElementById('exam-form');
    const trackerBar = document.getElementById('situation-tracker-bar');
    const floatingScore = document.getElementById('floating-score');
    const submitBtn = document.getElementById('submit-btn');
    const sidebarControls = document.getElementById('sidebar-controls');

    examLayout.style.display = 'flex';
    form.innerHTML = '';
    trackerBar.innerHTML = '';
    floatingScore.innerHTML = '<h2>Score: - / -</h2>';
    submitBtn.disabled = false;
    submitBtn.style.display = isFacultyMode ? 'none' : 'block';
    sidebarControls.style.display = isFacultyMode ? 'none' : 'flex';

    let data = [];
    if (isFacultyMode) {
      const res = await fetch('/generate-faculty-exam');
      data = await res.json();
    } else {
      const selectedMainTags = Array.from(document.querySelectorAll('input[name="mainTag"]:checked')).map(cb => cb.value);
      let selectedSubTags = Array.from(document.querySelectorAll('input[name="subTag"]:checked')).map(cb => cb.value);
      if (selectedSubTags.length === 0) {
        selectedSubTags = Array.from(document.querySelectorAll('input[name="subTag"]')).map(cb => cb.value);
      }
      const count = document.getElementById('situationCount').value;
      const response = await fetch(`/generate-exam?mainTags=${selectedMainTags.join(',')}&subTags=${selectedSubTags.join(',')}&count=${count}`);
      data = await response.json();
    }

    let globalNum = 1;
    let answerKey = [];

    data.forEach((situation, sIndex) => {
      const sDiv = document.createElement('div');
      sDiv.id = `situation-${sIndex}`;
      sDiv.classList.add('situation-container');

      sDiv.innerHTML += `<h3><strong>SITUATION ${isFacultyMode ? situation.id.toUpperCase() : sIndex + 1}</strong></h3>`;
      sDiv.innerHTML += `<p>${situation.situation}</p>`;

      const imgContainer = document.createElement('div');
      ['a','b','c','d','e'].forEach(letter => {
        const img = new Image();
        img.src = `psadquestions/${situation.id}${letter}.png`;
        img.onerror = () => {};
        img.onload = () => {
          img.style.maxWidth = '100%';
          img.style.margin = '10px 0';
          img.style.borderRadius = '10px';
          imgContainer.appendChild(img);
        };
      });
      sDiv.appendChild(imgContainer);

      situation.subquestions.forEach((sub, i) => {
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

          answerKey.push({ id: qId, correct: sub.correctAnswer });
        } else {
          const choices = sub.choices.map((c, j) => `<p>${String.fromCharCode(65+j)}. ${c}</p>`).join('');
          block.innerHTML += choices;
        }

        sDiv.appendChild(block);
        globalNum++;
      });

      form.appendChild(sDiv);
    });

    if (!isFacultyMode) {
      submitBtn.onclick = () => {
        let score = 0;
        answerKey.forEach(q => {
          const selected = document.querySelector(`input[name="${q.id}_hidden"]`)?.value;
          const choices = document.querySelectorAll(`[name="${q.id}"]`);
          const feedback = choices[0]?.closest('.question-block')?.querySelector('.correct-answer');
          const isCorrect = selected === q.correct;

          choices.forEach(box => {
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
        floatingScore.innerHTML = `<h2>Score: ${score} / ${answerKey.length} <br>⏱️ Time: ${formatTime(timeTaken)}</h2>`;

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
    }

    examStartTime = Date.now();
  });
}
