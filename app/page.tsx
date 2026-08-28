"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type HistoryItem = {
  question: string;
  solution: string;
};

type StudentLevel = "primary" | "middle" | "high" | "advanced";

const STUDENT_LEVELS: { id: StudentLevel; label: string }[] = [
  { id: "primary", label: "Primary" },
  { id: "middle", label: "Middle School" },
  { id: "high", label: "High School" },
  { id: "advanced", label: "Advanced" },
];

function isStudentLevel(value: string): value is StudentLevel {
  return STUDENT_LEVELS.some((level) => level.id === value);
}

function parseSolution(text: string) {
  const headings = [
    "FINAL ANSWER",
    "STEP-BY-STEP EXPLANATION",
    "WHY IT WORKS",
    "COMMON MISTAKE",
    "PRACTICE QUESTION",
  ];

  const result: Record<string, string> = {};

  headings.forEach((heading, index) => {
    const start = text.indexOf(heading);

    if (start === -1) return;

    const contentStart = start + heading.length;
    let contentEnd = text.length;

    for (let i = index + 1; i < headings.length; i++) {
      const nextHeading = text.indexOf(headings[i], contentStart);

      if (nextHeading !== -1) {
        contentEnd = nextHeading;
        break;
      }
    }

    result[heading] = text.slice(contentStart, contentEnd).trim();
  });

  return result;
}

function getSourceMathQuestion(question: string, solution: string): string {
  const steps = parseSolution(solution)["STEP-BY-STEP EXPLANATION"] || "";
  const match =
    steps.match(/Read from photo:\s*(.+)/i);

  if (match?.[1]) {
    return match[1].trim().split("\n")[0].trim();
  }

  return question.trim();
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [solution, setSolution] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [studentLevel, setStudentLevel] = useState<StudentLevel>("middle");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageLoading, setImageLoading] = useState(false);

  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [practiceChecking, setPracticeChecking] = useState(false);
  const [practiceFeedback, setPracticeFeedback] = useState("");
  const [practiceHint, setPracticeHint] = useState("");
  const [practiceCorrect, setPracticeCorrect] = useState<boolean | null>(null);
  const [practiceWrongAttempts, setPracticeWrongAttempts] = useState(0);
  const [practiceRevealing, setPracticeRevealing] = useState(false);
  const [practiceRevealedSolution, setPracticeRevealedSolution] = useState("");
  const [activePracticeQuestion, setActivePracticeQuestion] = useState("");
  const [practiceGenerating, setPracticeGenerating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestSolutionRef = useRef(solution);
  const latestPracticeQuestionRef = useRef("");
  latestSolutionRef.current = solution;

  const examples = [
    "25 + 15",
    "50 × 12",
    "100 ÷ 4",
    "√144",
    "25% of 200",
    "x - 3 = 7",
  ];

  useEffect(() => {
    const savedHistory = localStorage.getItem("easymath-history");

    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch {
        setHistory([]);
      }
    }

    const savedTheme = localStorage.getItem("easymath-theme");

    if (savedTheme === "dark") {
      setDarkMode(true);
    }

    const savedLevel = localStorage.getItem("easymath-level");

    if (savedLevel && isStudentLevel(savedLevel)) {
      setStudentLevel(savedLevel);
    }
  }, []);

  useEffect(() => {
    setPracticeAnswer("");
    setPracticeChecking(false);
    setPracticeFeedback("");
    setPracticeHint("");
    setPracticeCorrect(null);
    setPracticeWrongAttempts(0);
    setPracticeRevealing(false);
    setPracticeRevealedSolution("");
    setActivePracticeQuestion("");
    setPracticeGenerating(false);
  }, [solution]);

  function saveHistory(items: HistoryItem[]) {
    setHistory(items);
    localStorage.setItem("easymath-history", JSON.stringify(items));
  }

  function toggleTheme() {
    const nextTheme = !darkMode;

    setDarkMode(nextTheme);

    localStorage.setItem(
      "easymath-theme",
      nextTheme ? "dark" : "light"
    );
  }

  function selectStudentLevel(level: StudentLevel) {
    setStudentLevel(level);
    localStorage.setItem("easymath-level", level);
  }

  async function solveQuestion(customQuestion?: string) {
    const finalQuestion = customQuestion ?? question;

    if (!finalQuestion.trim()) {
      setMessage("Please enter a math question.");
      return;
    }

    if (loading || imageLoading) {
      return;
    }

    setQuestion(finalQuestion);
    setLoading(true);
    setSolution("");
    setMessage("");

    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: finalQuestion,
          level: studentLevel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSolution(data.error || "Something went wrong.");
        return;
      }

      const result = data.solution || "No solution returned.";

      setSolution(result);

      const updatedHistory = [
        {
          question: finalQuestion,
          solution: result,
        },
        ...history.filter(
          (item) => item.question !== finalQuestion
        ),
      ].slice(0, 10);

      saveHistory(updatedHistory);
    } catch {
      setSolution("Unable to connect to the solver.");
    } finally {
      setLoading(false);
    }
  }

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (
      file.type &&
      !file.type.startsWith("image/") &&
      !file.type.toLowerCase().includes("heic") &&
      !file.type.toLowerCase().includes("heif")
    ) {
      setMessage("Please select an image file.");
      return;
    }

    const name = file.name.toLowerCase();

    if (
      !file.type &&
      !name.endsWith(".heic") &&
      !name.endsWith(".heif") &&
      !name.endsWith(".hif") &&
      !name.endsWith(".jpg") &&
      !name.endsWith(".jpeg") &&
      !name.endsWith(".png") &&
      !name.endsWith(".gif") &&
      !name.endsWith(".webp")
    ) {
      setMessage("Please select an image file.");
      return;
    }

    setImageFile(file);
    setSolution("");
    setMessage("");

    const preview = URL.createObjectURL(file);
    setImagePreview(preview);
  }

  async function solveImage() {
    if (!imageFile) {
      setMessage("Please choose a photo first.");
      return;
    }

    if (imageLoading || loading) {
      return;
    }

    setImageLoading(true);
    setSolution("");
    setMessage("");
    setQuestion("Math problem from uploaded photo");

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("level", studentLevel);

      const response = await fetch("/api/solve-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setSolution(
          data.error || "Unable to solve the image."
        );
        return;
      }

      const result =
        data.solution || "No solution returned.";

      setSolution(result);

      const updatedHistory = [
        {
          question: "📷 Math problem from photo",
          solution: result,
        },
        ...history,
      ].slice(0, 10);

      saveHistory(updatedHistory);
    } catch {
      setSolution(
        "Unable to connect to the photo solver."
      );
    } finally {
      setImageLoading(false);
    }
  }

  async function checkPracticeAnswer() {
    if (!practiceQuestion.trim() || practiceChecking) {
      return;
    }

    if (practiceGenerating || practiceRevealing) {
      return;
    }

    if (!practiceAnswer.trim()) {
      setPracticeCorrect(null);
      setPracticeHint("");
      setPracticeFeedback("Please enter an answer to check.");
      return;
    }

    if (practiceRevealing) {
      return;
    }

    setPracticeChecking(true);
    setPracticeFeedback("");
    setPracticeHint("");
    setPracticeCorrect(null);

    const solutionWhenChecked = solution;
    const practiceWhenChecked = practiceQuestion;

    try {
      const response = await fetch("/api/check-practice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          practiceQuestion,
          studentAnswer: practiceAnswer,
          level: studentLevel,
        }),
      });

      const data = await response.json();

      if (
        latestSolutionRef.current !== solutionWhenChecked ||
        latestPracticeQuestionRef.current !== practiceWhenChecked
      ) {
        return;
      }

      if (!response.ok) {
        setPracticeCorrect(null);
        setPracticeHint("");
        setPracticeFeedback(
          data.error || "Unable to check that answer. Please try again."
        );
        return;
      }

      const isCorrect = Boolean(data.correct);

      setPracticeCorrect(isCorrect);
      setPracticeFeedback(
        typeof data.feedback === "string"
          ? data.feedback
          : isCorrect
            ? "Yes — that's right."
            : "Not quite."
      );
      setPracticeHint(
        isCorrect ? "" : typeof data.hint === "string" ? data.hint : ""
      );

      if (isCorrect) {
        setPracticeWrongAttempts(0);
      } else {
        setPracticeWrongAttempts((count) => count + 1);
      }
    } catch {
      if (
        latestSolutionRef.current !== solutionWhenChecked ||
        latestPracticeQuestionRef.current !== practiceWhenChecked
      ) {
        return;
      }

      setPracticeCorrect(null);
      setPracticeHint("");
      setPracticeFeedback(
        "Unable to check that answer. Please try again."
      );
    } finally {
      if (
        latestSolutionRef.current === solutionWhenChecked &&
        latestPracticeQuestionRef.current === practiceWhenChecked
      ) {
        setPracticeChecking(false);
      }
    }
  }

  function formatPracticeSolution(raw: string): string {
    const parsed = parseSolution(raw);
    const finalAnswer = parsed["FINAL ANSWER"]
      ? parsed["FINAL ANSWER"].replace(/Great job![\s\S]*$/, "").trim()
      : "";
    const steps = parsed["STEP-BY-STEP EXPLANATION"]
      ? parsed["STEP-BY-STEP EXPLANATION"]
          .replace(/Great job![\s\S]*$/, "")
          .trim()
      : "";

    if (finalAnswer && steps) {
      return `Final answer:\n${finalAnswer}\n\nStep-by-step:\n${steps}`;
    }

    return raw.trim();
  }

  async function showPracticeSolution() {
    if (
      !practiceQuestion.trim() ||
      practiceRevealing ||
      practiceChecking ||
      practiceGenerating
    ) {
      return;
    }

    setPracticeRevealing(true);

    const solutionWhenRevealed = solution;
    const practiceWhenRevealed = practiceQuestion;

    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: practiceQuestion,
          level: studentLevel,
        }),
      });

      const data = await response.json();

      if (
        latestSolutionRef.current !== solutionWhenRevealed ||
        latestPracticeQuestionRef.current !== practiceWhenRevealed
      ) {
        return;
      }

      if (!response.ok) {
        setPracticeFeedback(
          data.error || "Unable to show the solution. Please try again."
        );
        return;
      }

      const raw = data.solution || "";

      if (!raw.trim()) {
        setPracticeFeedback("Unable to show the solution. Please try again.");
        return;
      }

      setPracticeRevealedSolution(formatPracticeSolution(raw));
    } catch {
      if (
        latestSolutionRef.current !== solutionWhenRevealed ||
        latestPracticeQuestionRef.current !== practiceWhenRevealed
      ) {
        return;
      }

      setPracticeFeedback("Unable to show the solution. Please try again.");
    } finally {
      if (
        latestSolutionRef.current === solutionWhenRevealed &&
        latestPracticeQuestionRef.current === practiceWhenRevealed
      ) {
        setPracticeRevealing(false);
      }
    }
  }

  async function createRelatedPracticeQuestion() {
    if (
      practiceGenerating ||
      practiceChecking ||
      practiceRevealing ||
      loading ||
      imageLoading
    ) {
      return;
    }

    const sourceQuestion = getSourceMathQuestion(question, solution);
    const currentPractice = practiceQuestion;

    if (!sourceQuestion && !currentPractice) {
      return;
    }

    setPracticeGenerating(true);

    const solutionWhenGenerated = solution;
    const practiceWhenGenerated = currentPractice;

    try {
      const response = await fetch("/api/generate-practice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originalQuestion: sourceQuestion || currentPractice,
          previousPracticeQuestion: currentPractice,
          level: studentLevel,
        }),
      });

      const data = await response.json();

      if (
        latestSolutionRef.current !== solutionWhenGenerated ||
        latestPracticeQuestionRef.current !== practiceWhenGenerated
      ) {
        return;
      }

      if (!response.ok) {
        setPracticeCorrect(null);
        setPracticeHint("");
        setPracticeFeedback(
          data.error || "Unable to create a new question. Please try again."
        );
        return;
      }

      const nextQuestion =
        typeof data.practiceQuestion === "string"
          ? data.practiceQuestion.trim()
          : "";

      if (!nextQuestion) {
        setPracticeCorrect(null);
        setPracticeHint("");
        setPracticeFeedback("Unable to create a new question. Please try again.");
        return;
      }

      resetPracticeState();
      setActivePracticeQuestion(nextQuestion);
    } catch {
      if (
        latestSolutionRef.current !== solutionWhenGenerated ||
        latestPracticeQuestionRef.current !== practiceWhenGenerated
      ) {
        return;
      }

      setPracticeCorrect(null);
      setPracticeHint("");
      setPracticeFeedback(
        "Unable to create a new question. Please try again."
      );
    } finally {
      if (latestSolutionRef.current === solutionWhenGenerated) {
        setPracticeGenerating(false);
      }
    }
  }

  function resetPracticeState() {
    setPracticeAnswer("");
    setPracticeChecking(false);
    setPracticeFeedback("");
    setPracticeHint("");
    setPracticeCorrect(null);
    setPracticeWrongAttempts(0);
    setPracticeRevealing(false);
    setPracticeRevealedSolution("");
  }

  function removeImage() {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(null);
    setImagePreview("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearEverything() {
    setQuestion("");
    setSolution("");
    setMessage("");
    removeImage();
  }

  function clearHistory() {
    setHistory([]);
    localStorage.removeItem("easymath-history");
  }

  const parts = solution ? parseSolution(solution) : {};

  const parsedPracticeQuestion = parts["PRACTICE QUESTION"]
    ? parts["PRACTICE QUESTION"]
        .replace(/Great job![\s\S]*$/, "")
        .trim()
    : "";

  const practiceQuestion =
    activePracticeQuestion.trim() || parsedPracticeQuestion;

  latestPracticeQuestionRef.current = practiceQuestion;

  const theme = useMemo(
    () => ({
      page: darkMode ? "#0f172a" : "#f8fafc",

      panel: darkMode
        ? "rgba(15,23,42,0.92)"
        : "rgba(255,255,255,0.96)",

      panelSoft: darkMode ? "#111827" : "#ffffff",

      text: darkMode ? "#e5e7eb" : "#172033",

      muted: darkMode ? "#94a3b8" : "#64748b",

      border: darkMode ? "#334155" : "#e2e8f0",

      input: darkMode ? "#111827" : "#fbfdff",

      buttonSoft: darkMode ? "#1e293b" : "#ffffff",

      shadow: darkMode
        ? "0 20px 55px rgba(0,0,0,0.25)"
        : "0 20px 55px rgba(15,23,42,0.08)",
    }),
    [darkMode]
  );

  return (
    <main
      style={{
        minHeight: "100vh",

        background: darkMode
          ? "radial-gradient(circle at top left, #1e3a8a 0%, transparent 30%), radial-gradient(circle at bottom right, #14532d 0%, transparent 30%), #0f172a"
          : "radial-gradient(circle at top left, #dbeafe 0%, transparent 35%), radial-gradient(circle at bottom right, #dcfce7 0%, transparent 35%), #f8fafc",

        padding: "24px 18px 40px",

        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",

        color: theme.text,
      }}
    >
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: "24px",
            padding: "18px 22px",
            boxShadow: theme.shadow,
            marginBottom: "22px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "18px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "18px",
                  display: "grid",
                  placeItems: "center",

                  background:
                    "linear-gradient(135deg, #2563eb, #16a34a)",

                  color: "white",
                  fontSize: "28px",
                  fontWeight: 900,
                }}
              >
                ∑
              </div>

              <div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: "32px",
                    fontWeight: 900,
                  }}
                >
                  EasyMath AI
                </h1>

                <p
                  style={{
                    margin: "4px 0 0",
                    color: theme.muted,
                    fontWeight: 600,
                  }}
                >
                  Your Personal AI Math Tutor
                </p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "999px",

                  background: darkMode
                    ? "#172554"
                    : "#eff6ff",

                  color: darkMode
                    ? "#bfdbfe"
                    : "#1d4ed8",

                  fontWeight: 800,
                  fontSize: "13px",
                }}
              >
                Making Math Easy for Everyone
              </div>

              <button
                onClick={toggleTheme}
                style={{
                  border: `1px solid ${theme.border}`,
                  background: theme.buttonSoft,
                  width: "46px",
                  height: "46px",
                  borderRadius: "14px",
                  cursor: "pointer",
                  fontSize: "20px",
                }}
              >
                {darkMode ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
        </header>

        <div
          style={{
            display: "grid",

            gridTemplateColumns:
              "minmax(0,1.7fr) minmax(280px,0.8fr)",

            gap: "22px",
            alignItems: "start",
          }}
        >
          <section
            style={{
              background: theme.panel,
              border: `1px solid ${theme.border}`,
              borderRadius: "26px",
              padding: "30px",
              boxShadow: theme.shadow,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                padding: "8px 12px",
                borderRadius: "999px",

                background: darkMode
                  ? "#172554"
                  : "#eef4ff",

                color: darkMode
                  ? "#bfdbfe"
                  : "#2563eb",

                fontWeight: 900,
                fontSize: "12px",
              }}
            >
              ✨ ASK EASYMATH
            </div>

            <h2
              style={{
                margin: "14px 0 8px",
                fontSize: "31px",
              }}
            >
              What math problem can I help you solve?
            </h2>

            <p
              style={{
                color: theme.muted,
                lineHeight: 1.6,
              }}
            >
              Type your question or upload a photo of
              homework, a worksheet, or handwritten math.
            </p>

            <div
              style={{
                marginTop: "18px",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: "16px",
                  marginBottom: "6px",
                }}
              >
                Student Level
              </div>

              <div
                style={{
                  color: theme.muted,
                  fontSize: "14px",
                  marginBottom: "12px",
                }}
              >
                Same correct answer. Clearer explanation for your level.
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                {STUDENT_LEVELS.map((level) => {
                  const selected = studentLevel === level.id;

                  return (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => selectStudentLevel(level.id)}
                      style={{
                        border: selected
                          ? "1px solid #2563eb"
                          : `1px solid ${theme.border}`,
                        background: selected
                          ? darkMode
                            ? "#172554"
                            : "#eef4ff"
                          : theme.buttonSoft,
                        color: selected
                          ? darkMode
                            ? "#bfdbfe"
                            : "#2563eb"
                          : theme.text,
                        padding: "10px 14px",
                        borderRadius: "12px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {level.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <textarea
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setMessage("");
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey
                ) {
                  e.preventDefault();
                  if (!loading && !imageLoading) {
                    solveQuestion();
                  }
                }
              }}
              placeholder="Example: Solve x + 8 = 31"
              style={{
                width: "100%",
                minHeight: "150px",
                marginTop: "20px",
                padding: "18px",
                boxSizing: "border-box",
                borderRadius: "17px",
                border: `1px solid ${theme.border}`,
                background: theme.input,
                color: theme.text,
                fontSize: "18px",
              }}
            />

            <div
              style={{
                marginTop: "18px",
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              {examples.map((example) => (
                <button
                  key={example}
                  onClick={() =>
                    solveQuestion(example)
                  }
                  disabled={
                    loading || imageLoading
                  }
                  style={{
                    border: `1px solid ${theme.border}`,
                    background:
                      theme.buttonSoft,

                    color: theme.text,

                    padding: "10px 14px",
                    borderRadius: "12px",

                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {example}
                </button>
              ))}
            </div>

            <div
              style={{
                marginTop: "22px",
                padding: "18px",

                border: `1px dashed ${
                  darkMode
                    ? "#475569"
                    : "#94a3b8"
                }`,

                borderRadius: "17px",
                background: darkMode
                  ? "#111827"
                  : "#f8fafc",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: "16px",
                  marginBottom: "6px",
                }}
              >
                📷 Photo Solver
              </div>

              <div
                style={{
                  color: theme.muted,
                  fontSize: "14px",
                  marginBottom: "14px",
                }}
              >
                Upload a photo of a math question and
                EasyMath AI will read and solve it.
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif,.hif"
                onChange={handleImage}
                style={{
                  display: "none",
                }}
              />

              {!imagePreview && (
                <button
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  style={{
                    border: `1px solid ${theme.border}`,

                    background:
                      theme.buttonSoft,

                    color: theme.text,

                    padding: "12px 17px",
                    borderRadius: "12px",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  📷 Choose Photo
                </button>
              )}

              {imagePreview && (
                <div>
                  <img
                    src={imagePreview}
                    alt="Math problem preview"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "350px",
                      objectFit: "contain",
                      borderRadius: "14px",
                      border: `1px solid ${theme.border}`,
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      flexWrap: "wrap",
                      marginTop: "14px",
                    }}
                  >
                    <button
                      onClick={solveImage}
                      disabled={imageLoading || loading}
                      style={{
                        border: "none",

                        background:
                          "linear-gradient(135deg,#16a34a,#15803d)",

                        color: "white",

                        padding: "13px 18px",
                        borderRadius: "12px",

                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      {imageLoading
                        ? "Solving..."
                        : "✨ Solve Photo"}
                    </button>

                    <button
                      onClick={removeImage}
                      disabled={imageLoading}
                      style={{
                        border: `1px solid ${theme.border}`,

                        background:
                          theme.buttonSoft,

                        color: theme.text,

                        padding: "13px 18px",

                        borderRadius: "12px",

                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            {message && (
              <div
                style={{
                  marginTop: "12px",
                  color: "#f59e0b",
                  fontWeight: 700,
                }}
              >
                {message}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "22px",
              }}
            >
              <button
                onClick={() =>
                  solveQuestion()
                }
                disabled={
                  loading || imageLoading
                }
                style={{
                  border: "none",

                  background:
                    "linear-gradient(135deg,#2563eb,#1d4ed8)",

                  color: "white",

                  padding: "15px 26px",

                  borderRadius: "14px",

                  fontWeight: 900,
                  fontSize: "16px",

                  cursor: "pointer",
                }}
              >
                {loading
                  ? "Solving..."
                  : "✨ Solve Now"}
              </button>

              <button
                onClick={clearEverything}
                style={{
                  border: `1px solid ${theme.border}`,

                  background:
                    theme.buttonSoft,

                  color: theme.text,

                  padding: "15px 22px",

                  borderRadius: "14px",

                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>

            {(loading || imageLoading) && (
              <div
                style={{
                  marginTop: "22px",
                  padding: "16px",

                  borderRadius: "14px",

                  background: darkMode
                    ? "#172554"
                    : "#eff6ff",
                }}
              >
                <strong>
                  🤖 EasyMath AI is working...
                </strong>
              </div>
            )}

            {solution &&
              !loading &&
              !imageLoading && (
                <div
                  style={{
                    marginTop: "28px",
                    display: "grid",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: "15px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "#2563eb",
                          fontWeight: 900,
                          fontSize: "12px",
                        }}
                      >
                        EASYMATH AI SOLUTION
                      </div>

                      <div
                        style={{
                          marginTop: "5px",
                          fontWeight: 800,
                        }}
                      >
                        {question}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(
                          solution
                        )
                      }
                      style={{
                        border: `1px solid ${theme.border}`,

                        background:
                          theme.buttonSoft,

                        color: theme.text,

                        borderRadius: "11px",
                        padding: "10px 14px",

                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Copy
                    </button>
                  </div>

                  {parts["FINAL ANSWER"] && (
                    <div
                      style={{
                        padding: "22px",

                        borderRadius: "18px",

                        background: darkMode
                          ? "#14532d"
                          : "#ecfdf5",

                        border:
                          "1px solid #22c55e",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 900,
                          color: darkMode
                            ? "#86efac"
                            : "#15803d",
                        }}
                      >
                        ✅ FINAL ANSWER
                      </div>

                      <div
                        style={{
                          fontSize: "26px",
                          fontWeight: 900,
                          marginTop: "10px",
                        }}
                      >
                        {
                          parts[
                            "FINAL ANSWER"
                          ]
                        }
                      </div>
                    </div>
                  )}

                  {parts[
                    "STEP-BY-STEP EXPLANATION"
                  ] && (
                    <div
                      style={{
                        padding: "22px",
                        borderRadius: "18px",

                        background: darkMode
                          ? "#172554"
                          : "#eff6ff",

                        border:
                          "1px solid #3b82f6",
                      }}
                    >
                      <strong>
                        📘 STEP-BY-STEP
                      </strong>

                      <div
                        style={{
                          whiteSpace:
                            "pre-wrap",

                          marginTop: "12px",

                          lineHeight: 1.85,
                        }}
                      >
                        {
                          parts[
                            "STEP-BY-STEP EXPLANATION"
                          ]
                        }
                      </div>
                    </div>
                  )}

                  {parts["WHY IT WORKS"] && (
                    <div
                      style={{
                        padding: "22px",
                        borderRadius: "18px",

                        background: darkMode
                          ? "#422006"
                          : "#fffbeb",

                        border:
                          "1px solid #f59e0b",
                      }}
                    >
                      <strong>
                        💡 WHY IT WORKS
                      </strong>

                      <div
                        style={{
                          whiteSpace:
                            "pre-wrap",

                          marginTop: "10px",

                          lineHeight: 1.7,
                        }}
                      >
                        {
                          parts[
                            "WHY IT WORKS"
                          ]
                        }
                      </div>
                    </div>
                  )}

                  {parts[
                    "COMMON MISTAKE"
                  ] && (
                    <div
                      style={{
                        padding: "22px",
                        borderRadius: "18px",

                        background: darkMode
                          ? "#4c0519"
                          : "#fff1f2",

                        border:
                          "1px solid #fb7185",
                      }}
                    >
                      <strong>
                        ⚠️ COMMON MISTAKE
                      </strong>

                      <div
                        style={{
                          whiteSpace:
                            "pre-wrap",

                          marginTop: "10px",

                          lineHeight: 1.7,
                        }}
                      >
                        {
                          parts[
                            "COMMON MISTAKE"
                          ]
                        }
                      </div>
                    </div>
                  )}

                  {!parts["FINAL ANSWER"] &&
                    !parts["STEP-BY-STEP EXPLANATION"] &&
                    !parts["WHY IT WORKS"] &&
                    !parts["COMMON MISTAKE"] &&
                    !practiceQuestion && (
                      <div
                        style={{
                          padding: "22px",
                          borderRadius: "18px",
                          background: darkMode
                            ? "#172554"
                            : "#eff6ff",
                          border: "1px solid #3b82f6",
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.85,
                        }}
                      >
                        {solution}
                      </div>
                    )}

                  {practiceQuestion && (
                    <div
                      style={{
                        padding: "22px",
                        borderRadius: "18px",

                        background: darkMode
                          ? "#2e1065"
                          : "#faf5ff",

                        border:
                          "1px solid #8b5cf6",
                      }}
                    >
                      <strong>
                        🎯 YOUR TURN
                      </strong>

                      <div
                        style={{
                          fontSize: "20px",
                          fontWeight: 800,
                          marginTop: "10px",
                        }}
                      >
                        {practiceQuestion}
                      </div>

                      <input
                        value={practiceAnswer}
                        onChange={(e) => {
                          setPracticeAnswer(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (
                              !practiceChecking &&
                              !practiceRevealing &&
                              !practiceGenerating
                            ) {
                              checkPracticeAnswer();
                            }
                          }
                        }}
                        placeholder="Type your answer"
                        disabled={
                          practiceChecking ||
                          practiceRevealing ||
                          practiceGenerating
                        }
                        style={{
                          width: "100%",
                          marginTop: "16px",
                          padding: "14px 16px",
                          boxSizing: "border-box",
                          borderRadius: "12px",
                          border: `1px solid ${
                            darkMode ? "#6d28d9" : "#c4b5fd"
                          }`,
                          background: darkMode ? "#1e1b4b" : "#ffffff",
                          color: theme.text,
                          fontSize: "16px",
                          fontWeight: 700,
                        }}
                      />

                      <button
                        type="button"
                        onClick={checkPracticeAnswer}
                        disabled={
                          practiceChecking ||
                          practiceRevealing ||
                          practiceGenerating
                        }
                        style={{
                          marginTop: "12px",
                          border: "none",
                          background: practiceChecking
                            ? "#a78bfa"
                            : "#7c3aed",
                          color: "white",
                          padding: "11px 17px",
                          borderRadius: "11px",
                          fontWeight: 800,
                          cursor: practiceChecking
                            ? "wait"
                            : "pointer",
                        }}
                      >
                        {practiceChecking
                          ? "Checking..."
                          : "Check Answer"}
                      </button>

                      {practiceFeedback && (
                        <div
                          style={{
                            marginTop: "14px",
                            padding: "14px 16px",
                            borderRadius: "12px",
                            background:
                              practiceCorrect === true
                                ? darkMode
                                  ? "#14532d"
                                  : "#dcfce7"
                                : practiceCorrect === false
                                  ? darkMode
                                    ? "#4c0519"
                                    : "#ffe4e6"
                                  : darkMode
                                    ? "#3b0764"
                                    : "#ede9fe",
                            border:
                              practiceCorrect === true
                                ? "1px solid #22c55e"
                                : practiceCorrect === false
                                  ? "1px solid #fb7185"
                                  : "1px solid #8b5cf6",
                            fontWeight: 700,
                            lineHeight: 1.6,
                          }}
                        >
                          {practiceFeedback}
                          {practiceCorrect === false && practiceHint ? (
                            <div
                              style={{
                                marginTop: "8px",
                                fontWeight: 600,
                              }}
                            >
                              Hint: {practiceHint}
                            </div>
                          ) : null}
                        </div>
                      )}

                      {practiceWrongAttempts >= 2 &&
                        !practiceRevealedSolution && (
                          <button
                            type="button"
                            onClick={showPracticeSolution}
                            disabled={
                              practiceRevealing ||
                              practiceChecking ||
                              practiceGenerating
                            }
                            style={{
                              marginTop: "12px",
                              border: "none",
                              background: practiceRevealing
                                ? "#a78bfa"
                                : "#6d28d9",
                              color: "white",
                              padding: "11px 17px",
                              borderRadius: "11px",
                              fontWeight: 800,
                              cursor:
                                practiceRevealing || practiceChecking
                                  ? "wait"
                                  : "pointer",
                            }}
                          >
                            {practiceRevealing
                              ? "Solving..."
                              : "Show Solution"}
                          </button>
                        )}

                      {practiceRevealedSolution && (
                        <div
                          style={{
                            marginTop: "14px",
                            padding: "14px 16px",
                            borderRadius: "12px",
                            background: darkMode ? "#1e1b4b" : "#ffffff",
                            border: "1px solid #8b5cf6",
                            fontWeight: 600,
                            lineHeight: 1.7,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {practiceRevealedSolution}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={createRelatedPracticeQuestion}
                        disabled={
                          practiceGenerating ||
                          practiceChecking ||
                          practiceRevealing ||
                          loading ||
                          imageLoading
                        }
                        style={{
                          marginTop: "16px",

                          border: "none",

                          background:
                            practiceGenerating
                              ? "#a78bfa"
                              : "#7c3aed",

                          color: "white",

                          padding:
                            "11px 17px",

                          borderRadius:
                            "11px",

                          fontWeight: 800,
                          cursor:
                            practiceGenerating
                              ? "wait"
                              : "pointer",
                        }}
                      >
                        {practiceGenerating
                          ? "Creating question..."
                          : "Try This Question →"}
                      </button>
                    </div>
                  )}
                </div>
              )}
          </section>

          <aside
            style={{
              background: theme.panel,

              border: `1px solid ${theme.border}`,

              borderRadius: "26px",

              padding: "23px",

              boxShadow: theme.shadow,
            }}
          >
            <div
              style={{
                display: "flex",

                justifyContent:
                  "space-between",

                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#16a34a",

                    fontSize: "12px",

                    fontWeight: 900,
                  }}
                >
                  YOUR WORK
                </div>

                <h3>
                  Recent Questions
                </h3>
              </div>

              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  style={{
                    border: "none",

                    background:
                      "transparent",

                    color: theme.muted,

                    fontWeight: 800,

                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              {history.map(
                (item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setQuestion(
                        item.question
                      );

                      setSolution(
                        item.solution
                      );
                    }}
                    style={{
                      width: "100%",

                      textAlign: "left",

                      padding: "14px",

                      border: `1px solid ${theme.border}`,

                      borderRadius: "13px",

                      background:
                        theme.buttonSoft,

                      color: theme.text,

                      fontWeight: 700,

                      cursor: "pointer",
                    }}
                  >
                    {item.question}
                  </button>
                )
              )}
            </div>

            <div
              style={{
                marginTop: "20px",

                padding: "18px",

                borderRadius: "17px",

                background: darkMode
                  ? "linear-gradient(135deg,#172554,#14532d)"
                  : "linear-gradient(135deg,#eff6ff,#f0fdf4)",
              }}
            >
              <strong>
                Student Tip
              </strong>

              <div
                style={{
                  marginTop: "7px",

                  color: theme.muted,

                  fontSize: "14px",

                  lineHeight: 1.6,
                }}
              >
                Take a clear photo with the full math
                question visible for the best result.
              </div>
            </div>
          </aside>
        </div>

        <p
          style={{
            textAlign: "center",

            color: theme.muted,

            marginTop: "24px",

            fontSize: "13px",

            fontWeight: 600,
          }}
        >
          EasyMath AI • Learn the method, not just the
          answer.
        </p>
      </div>
    </main>
  );
}