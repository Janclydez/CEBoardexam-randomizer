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
});

let examStartTime = null;

// 2. Main exam generation logic
document.getElementById('exam-settings').addEventListener('submit', async (e) => {
  e.preventDefault();

  const selectedMainTags = Array.from(document.querySelectorAll('input[name="mainTag"]:checked')).map(cb => cb.value);
  let selectedSubTags = Array.from(document.querySelectorAll('input[name="subTag"]:checked')).map(cb => cb.value);

  if (selectedSubTags.length === 0) {
    selectedSubTags = Array.from(document.querySelectorAll('input[name="subTag"]')).map(cb => cb.value);
  }

  const count = document.getElementById('situationCount').value;
  const response = await fetch(`/generate-exam?mainTags=${selectedMainTags.join(',')}&subTags=${selectedSubTags.join(',')}&count=${count}`);
  const data = await response.json();

  const form = document.getElementById('exam-form');
  form.innerHTML = '';
  form.style.display = 'block';

  const trackerBar = document.createElement('div');
  trackerBar.id = 'situation-tracker-bar';
  form.before(trackerBar);

  let globalNum = 1;
  let answerKey = [];

  const updateTrackerLayout = () => {
    const trackerDots = trackerBar.querySelectorAll('.tracker-dot');
    trackerBar.innerHTML = '';
    let row = document.createElement('div');
    row.classList.add('tracker-row');
    trackerDots.forEach((dot, index) => {
      if (index % 10 === 0 && index !== 0) {
        trackerBar.appendChild(row);
        row = document.createElement('div');
        row.classList.add('tracker-row');
      }
      row.appendChild(dot);
    });
    trackerBar.appendChild(row);
  };

  data.forEach((situation, sIndex) => {
    const sDiv = document.createElement('div');
    sDiv.id = `situation-${sIndex}`;
    sDiv.classList.add('situation-container');

    const sHeader = document.createElement('div');
    sHeader.innerHTML = `<h3>Situation ${sIndex + 1}</h3>`;
    sDiv.appendChild(sHeader);

    const sPara = document.createElement('p');
    sPara.innerHTML = situation.situation;
    sDiv.appendChild(sPara);

    const imageContainer = document.createElement('div');
    sDiv.appendChild(imageContainer);

    const imageLetters = ['a', 'b', 'c', 'd', 'e'];
    imageLetters.forEach(letter => {
      const img = new Image();
      const imgPath = `psadquestions/${situation.id}${letter}.png`;
      img.src = imgPath;
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
      block.style.marginTop = '10px';

      const questionP = document.createElement('p');
      questionP.innerHTML = `<b>${globalNum}. ${sub.question}</b>`;
      block.appendChild(questionP);

      sub.choices.forEach(choice => {
        const box = document.createElement('div');
        box.classList.add('choice-box');
        box.innerHTML = choice;
        box.dataset.value = choice;
        box.setAttribute('name', qId);
        box.style.cursor = 'pointer';
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
      feedback.style.fontStyle = 'italic';
      block.appendChild(feedback);

      answerKey.push({ id: qId, correct: sub.correctAnswer, situationIndex: sIndex });
      sDiv.appendChild(block);
      globalNum++;
    });

    const dot = document.createElement('div');
    dot.className = 'tracker-dot incomplete pulsing';
    dot.id = `tracker-${sIndex}`;
    dot.textContent = sIndex + 1;
    dot.onclick = () => {
      document.getElementById(`situation-${sIndex}`)?.scrollIntoView({ behavior: 'smooth' });
    };
    trackerBar.appendChild(dot);

    form.appendChild(sDiv);
  });

  updateTrackerLayout();

  examStartTime = Date.now();
  const oldFloating = document.getElementById('fixed-submit');
  if (oldFloating) oldFloating.remove();

  const submitBtn = document.createElement('button');
  submitBtn.textContent = "Submit Answers";
  submitBtn.id = "submit-btn";
  submitBtn.type = "button";
  submitBtn.style.marginTop = '20px';

  const floatingScore = document.createElement('div');
  floatingScore.id = 'floating-score';
  floatingScore.innerHTML = `<h2>Score: - / -</h2>`;

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  submitBtn.onclick = () => {
    submitBtn.disabled = true;
    let score = 0;
    const situationScores = {};

    answerKey.forEach(q => {
      const selectedVal = document.querySelector(`input[name="${q.id}_hidden"]`)?.value;
      const choiceBoxes = document.querySelectorAll(`[name="${q.id}"]`);
      const feedback = choiceBoxes[0]?.closest('.question-block')?.querySelector('.correct-answer');
      const isCorrect = selectedVal === q.correct;
      situationScores[q.situationIndex] = situationScores[q.situationIndex] || { correct: 0, total: 0 };
      situationScores[q.situationIndex].total++;
      if (isCorrect) situationScores[q.situationIndex].correct++;

      choiceBoxes.forEach(box => {
        const wasSelected = box.classList.contains('selected');
        box.classList.remove('selected');
        if (box.dataset.value === q.correct) {
          box.classList.add('correct');
        } else if (wasSelected) {
          box.classList.add('incorrect');
        }
      });

      if (isCorrect) score++;
      if (feedback) {
        feedback.innerHTML = `Correct answer: ${q.correct}`;
        feedback.style.display = 'block';
      }
    });

    const timeTaken = Math.round((Date.now() - examStartTime) / 1000);
    floatingScore.innerHTML = `<h2>Score: ${score} / ${answerKey.length} <br>⏱️ Time: ${formatTime(timeTaken)}</h2>`;

    document.querySelectorAll('.tracker-dot').forEach((dot, index) => {
      const scoreData = situationScores[index];
      dot.classList.remove('incomplete', 'complete', 'partial', 'pulsing');
      if (!scoreData) {
        dot.classList.add('incomplete');
      } else if (scoreData.correct === scoreData.total) {
        dot.classList.add('complete');
      } else if (scoreData.correct === 0) {
        dot.classList.add('incomplete');
      } else {
        dot.classList.add('partial');
      }
    });

    if (typeof gtag === 'function') {
      gtag('event', 'exam_completed', {
        event_category: 'Exam',
        event_label: 'Exam Submitted',
        value: score
      });
    }
  };

  const fixedContainer = document.createElement('div');
  fixedContainer.id = 'fixed-submit';
  fixedContainer.appendChild(floatingScore);
  fixedContainer.appendChild(submitBtn);
  document.body.appendChild(fixedContainer);
});
