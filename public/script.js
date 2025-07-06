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

  let tracker = document.getElementById('situation-tracker-bar');
  if (!tracker) {
    tracker = document.createElement('div');
    tracker.id = 'situation-tracker-bar';
    document.body.appendChild(tracker);
  } else {
    tracker.innerHTML = '';
  }

  let globalNum = 1;
  let answerKey = [];

  data.forEach((situation, sIndex) => {
    const sDiv = document.createElement('div');
    sDiv.id = `situation-${sIndex}`;
    sDiv.classList.add('situation-container'); // Add class for consistent layout

    const sHeader = document.createElement('h3');
    sHeader.innerHTML = `Situation ${sIndex + 1} <span style="float:right">&#9660;</span>`;
    sDiv.appendChild(sHeader);

    const sContent = document.createElement('div');
    sContent.classList.add('collapsible', 'open'); // Always open by default
    sDiv.appendChild(sContent);

    const sPara = document.createElement('p');
    sPara.innerHTML = situation.situation;
    sContent.appendChild(sPara);

    const imageContainer = document.createElement('div');
    sContent.appendChild(imageContainer);

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

      const questionP = document.createElement('p');
      questionP.innerHTML = `<b>${globalNum}. ${sub.question}</b>`;
      block.appendChild(questionP);

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
      sContent.appendChild(block);
      globalNum++;
    });

    const resourceLinks = situation.resources || {};
    const resourceContainer = document.createElement('div');
    resourceContainer.classList.add('resource-links');
    resourceContainer.style.display = 'none';

    ['youtube', 'facebook', 'website'].forEach(type => {
      if (resourceLinks[type]) {
        const link = document.createElement('a');
        link.href = resourceLinks[type];
        link.target = '_blank';
        const labelMap = {
          youtube: '📺 Watch on YouTube',
          facebook: '📘 View Facebook Post',
          website: '🌐 View Solution on Website'
        };
        link.textContent = labelMap[type];
        resourceContainer.appendChild(link);
      }
    });

    sContent.appendChild(resourceContainer);
    form.appendChild(sDiv);

    const dot = document.createElement('div');
    dot.className = 'tracker-dot incomplete';
    dot.id = `tracker-${sIndex}`;
    dot.onclick = () => {
      document.getElementById(`situation-${sIndex}`)?.scrollIntoView({ behavior: 'smooth' });
    };
    tracker.appendChild(dot);
  });

  examStartTime = Date.now();
  const oldFloating = document.getElementById('fixed-submit');
  if (oldFloating) oldFloating.remove();

  const submitBtn = document.createElement('button');
  submitBtn.textContent = "Submit Answers";
  submitBtn.id = "submit-btn";
  submitBtn.type = "button";

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

    answerKey.forEach(q => {
      const selectedVal = document.querySelector(`input[name="${q.id}_hidden"]`)?.value;
      const choiceBoxes = document.querySelectorAll(`[name="${q.id}"]`);
      const feedback = choiceBoxes[0]?.closest('.question-block')?.querySelector('.correct-answer');
      choiceBoxes.forEach(box => {
        if (box.dataset.value === q.correct) {
          box.classList.add('correct');
        } else if (box.classList.contains('selected')) {
          box.classList.add('incorrect');
        }
      });
      if (selectedVal === q.correct) score++;
      if (feedback) {
        feedback.innerHTML = `Correct answer: ${q.correct}`;
        feedback.style.display = 'block';
      }
    });

    const timeTaken = Math.round((Date.now() - examStartTime) / 1000);
    floatingScore.innerHTML = `<h2>Score: ${score} / ${answerKey.length} <br>⏱️ Time: ${formatTime(timeTaken)}</h2>`;

    data.forEach((_, index) => {
      const situationDiv = document.getElementById(`situation-${index}`);
      const isComplete = situationDiv.querySelectorAll('input[type="hidden"]').length ===
                         Array.from(situationDiv.querySelectorAll('input[type="hidden"]')).filter(input => input.value).length;
      const dot = document.getElementById(`tracker-${index}`);
      dot.classList.remove('complete', 'incomplete');
      dot.classList.add(isComplete ? 'complete' : 'incomplete');
    });

    document.querySelectorAll('.resource-links').forEach(link => {
      link.style.display = 'block';
      link.style.opacity = '0';
      setTimeout(() => {
        link.style.transition = 'opacity 0.6s ease-in-out';
        link.style.opacity = '1';
      }, 10);
    });
  };

  const fixedContainer = document.createElement('div');
  fixedContainer.id = 'fixed-submit';
  fixedContainer.appendChild(floatingScore);
  fixedContainer.appendChild(submitBtn);
  document.body.appendChild(fixedContainer);
});
