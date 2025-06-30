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

// 2. Main exam generation logic
document.getElementById('exam-settings').addEventListener('submit', async (e) => {
  e.preventDefault();

  const selectedMainTags = Array.from(document.querySelectorAll('input[name="mainTag"]:checked')).map(cb => cb.value);
  const selectedSubTags = Array.from(document.querySelectorAll('input[name="subTag"]:checked')).map(cb => cb.value);
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
    sDiv.innerHTML = `<h3>Situation ${sIndex + 1}</h3><p>${situation.situation}</p>`;

    // Inject optional images like q1a.png, q1b.png, ...
    const imageLetters = ['a', 'b', 'c', 'd', 'e'];
    imageLetters.forEach(letter => {
      const img = new Image();
      const imgPath = `psadquestions/${situation.id}${letter}.png`;
      img.src = imgPath;

      img.onload = () => {
        img.style.maxWidth = "100%";
        img.style.margin = "10px 0";
        img.style.borderRadius = "10px";
        sDiv.appendChild(img);
      };

      img.onerror = () => {
        // Do nothing if image not found
      };
    });

    // Subquestions
    situation.subquestions.forEach((sub, qIndex) => {
      const qId = `q${globalNum}`;
      const block = document.createElement('div');
      block.classList.add('question-block');
      block.innerHTML = `<p><b>${globalNum}. ${sub.question}</b></p>`;

      sub.choices.forEach(choice => {
  const box = document.createElement('div');
  box.classList.add('choice-box');
  box.textContent = choice;
  box.dataset.value = choice;
  box.onclick = () => {
    document.querySelectorAll(`[name="${qId}"]`).forEach(el => el.classList.remove('selected'));
    box.classList.add('selected');
    box.classList.add('selected');
    document.querySelector(`input[name="${qId}_hidden"]`).value = choice;
  };
  box.setAttribute('name', qId);
  block.appendChild(box);
});

const hiddenInput = document.createElement('input');
hiddenInput.type = 'hidden';
hiddenInput.name = `${qId}_hidden`;
block.appendChild(hiddenInput);


      block.innerHTML += `<p class="correct-answer" style="display:none; font-style: italic;"></p>`;
      answerKey.push({ id: qId, correct: sub.correctAnswer });
      sDiv.appendChild(block);
      globalNum++;
    });

    form.appendChild(sDiv);
  });

  // Remove old submit button if re-generating
  const oldBtn = document.getElementById('submit-btn');
  if (oldBtn) oldBtn.remove();

  const submitBtn = document.createElement('button');
  submitBtn.textContent = "Submit Answers";
  submitBtn.id = "submit-btn";
  submitBtn.type = "button";

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
      feedback.textContent = `Correct answer: ${q.correct}`;
      feedback.style.display = 'block';
    }
  });

  document.getElementById('score').innerHTML = `<h2>Score: ${score} / ${answerKey.length}</h2>`;
};


  form.appendChild(submitBtn);
});
