function solveMath() {

    let question =
        document.getElementById("question").value;

    try {

        let result = eval(question);

        document.getElementById("answer").innerHTML =
            "Answer: " + result;

    } catch {

        document.getElementById("answer").innerHTML =
            "Please enter a valid math expression.";
    }
}