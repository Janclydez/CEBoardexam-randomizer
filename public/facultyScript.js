async function generateFacultyExam() {
  const container = document.getElementById("exam-container");
  container.innerHTML = "";

  const showAnswers = document.getElementById("toggle-answers")?.checked;
  const letterChoices = ['A.', 'B.', 'C.', 'D.'];

  try {
    const res = await fetch('/psadquestions/faculty/index.json');
    const files = await res.json(); // ["q1.json", "q2.json", ...]

    for (const file of files) {
      const qData = await fetch(`/psadquestions/faculty/${file}`).then(r => r.json());
      const item = qData[0]; // each JSON is expected to contain a single situation

      const sDiv = document.createElement("div");
      sDiv.classList.add("situation-block");

      // SITUATION HEADER
      sDiv.innerHTML += `<h3><strong>SITUATION ${item.id.toUpperCase()}</strong></h3>`;
      sDiv.innerHTML += `<p>${item.situation}</p>`;

      // Dynamically insert images: q1a.png, q1b.png, ..., q1e.png
      const imgContainer = document.createElement('div');
      for (const suffix of ['a', 'b', 'c', 'd', 'e']) {
        const img = new Image();
        img.src = `/psadquestions/faculty/${item.id}${suffix}.png`;
        img.onerror = () => {}; // silently skip missing
        img.onload = () => {
          img.style.maxWidth = '100%';
          img.style.margin = '10px 0';
          imgContainer.appendChild(img);
        };
      }
      sDiv.appendChild(imgContainer);

      // Subquestions
      item.subquestions.forEach((q, index) => {
        const qNum = `${item.id.toUpperCase().replace('Q', '')}.${index + 1}`;
        sDiv.innerHTML += `<p><strong>${qNum}</strong> ${q.question}</p>`;

        q.choices.forEach((choice, i) => {
          const isCorrect = choice === q.correctAnswer;
          const highlight = isCorrect && showAnswers ? 'highlight-answer' : '';
          sDiv.innerHTML += `<p class="${highlight}">${letterChoices[i]} ${choice}</p>`;
        });
      });

      container.appendChild(sDiv);
      container.appendChild(document.createElement('hr'));
    }

  } catch (err) {
    console.error("Error loading faculty exam:", err);
    container.innerHTML = `<p style="color:red;">Failed to load faculty questions.</p>`;
  }
}
