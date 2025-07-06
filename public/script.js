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

let examStartTime = null; // Track exam start time

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

  let globalNum = 1;
  let answerKey = [];

  data.forEach((situation, sIndex) => {
    const sDiv = document.createElement('div');

    const sHeader = document.createElement('h3');
    sHeader.textContent = `Situation ${sIndex + 1}`;
    sHeader.style.cursor = 'pointer';
    sHeader.style.background = '#f0f0f0';
    sHeader.style.padding = '10px';
    sHeader.style.borderRadius = '8px';
    sHeader.onclick = () => {
      sContent.style.display = sContent.style.display === 'none' ? 'block' : 'none';
    };
    sDiv.appendChild(sHeader);

    const sContent = document.createElement('div');
    sContent.style.display = 'none';
    sContent.style.padding = '10px';
    sContent.style.border = '1px solid #ddd';
    sContent.style.borderRadius = '8px';
    sContent.style.marginBottom = '15px';

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
        box.style.border = '1px solid #ccc';
        box.style.padding = '5px';
        box.style.margin = '5px';
        box.style.borderRadius = '5px';
        box.style.cursor = 'pointer';

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
      feedback.style.fontStyle = 'italic';
      block.appendChild(feedback);

      answerKey.push({ id: qId, correct: sub.correctAnswer });
      sContent.appendChild(block);
      globalNum++;
    });

    const resourceLinks = situation.resources || {};
    const resourceContainer = document.createElement('div');
    resourceContainer.classList.add('resource-links');
    resourceContainer.style.marginTop = '10px';

    ['youtube', 'facebook', 'website'].forEach(type => {
      if (resourceLinks[type]) {
        const link = document.createElement('a');
        link.href = resourceLinks[type];
        link.target = '_blank';
        link.style.display = 'block';
        link.style.marginBottom = '5px';

        const labelMap = {
          youtube: '📺 Watch on YouTube',
          facebook: '📘 View Facebook Post',
          website: '🌐 View Solution on Website'
        };
        link.textContent = labelMap[type];

        link.addEventListener('click', () => {
          if (typeof gtag === 'function') {
            gtag('event', 'resource_click', {
              event_category: 'Resource',
              event_label: type
            });
          }
        });

        resourceContainer.appendChild(link);
      }
    });

    sContent.appendChild(resourceContainer);
    sDiv.appendChild(sContent);
    form.appendChild(sDiv);
  });

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
    floatingScore.innerHTML = `<h2>Score: ${score} / ${answerKey.length} <br>⏱️ Time: ${timeTaken} sec</h2>`;

    if (typeof gtag === 'function') {
      gtag('event', 'exam_completed', {
        event_category: 'Exam',
        event_label: 'Exam Submitted',
        value: score
      });
      gtag('event', 'exam_time_spent', {
        event_category: 'Exam',
        event_label: 'Time Taken (s)',
        value: timeTaken
      });
    }
  };

  const fixedContainer = document.createElement('div');
  fixedContainer.id = 'fixed-submit';
  fixedContainer.appendChild(floatingScore);
  fixedContainer.appendChild(submitBtn);
  document.body.appendChild(fixedContainer);
});