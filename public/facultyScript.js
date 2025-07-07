async function generateFacultyExam() {
  const res = await fetch('/psadquestions/faculty.json'); // your faculty question bank
  const data = await res.json();
  const container = document.getElementById("exam-container");
  container.innerHTML = "";

  data.forEach((item, i) => {
    const qBlock = document.createElement("div");
    qBlock.classList.add("question-block");

    const situationHTML = `<p><strong>SITUATION ${item.id}</strong>: ${item.situation}</p>`;
    qBlock.innerHTML += situationHTML;

    item.subquestions.forEach((sq, idx) => {
      const questionHTML = `<p><strong>${i + 1}.${idx + 1}</strong> ${sq.question}</p>`;
      qBlock.innerHTML += questionHTML;

      const letters = ['A.', 'B.', 'C.', 'D.'];
      sq.choices.forEach((choice, cIdx) => {
        const isCorrect = choice === sq.correctAnswer;
        const show = document.getElementById('toggle-answers')?.checked;

        qBlock.innerHTML += `<p class="${isCorrect && show ? 'highlight-answer' : ''}">${letters[cIdx]} ${choice}</p>`;
      });
    });

    container.appendChild(qBlock);
  });
}
