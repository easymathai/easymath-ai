async function solveMath() {
  const question = document.getElementById("question").value;
  const result = document.getElementById("answer");

  if (!question) {
    result.innerHTML = "Please enter a math question.";
    return;
  }

  result.innerHTML = "Solving...";

  const response = await fetch("/api/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question })
  });

  const data = await response.json();
  result.innerHTML = data.answer;
}