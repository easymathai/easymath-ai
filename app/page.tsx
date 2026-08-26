"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type HistoryItem = {
  question: string;
  solution: string;
};

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

export default function Home() {
  const [question, setQuestion] = useState("");
  const [solution, setSolution] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [darkMode, setDarkMode] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageLoading, setImageLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
  }, []);

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

  async function solveQuestion(customQuestion?: string) {
    const finalQuestion = customQuestion ?? question;

    if (!finalQuestion.trim()) {
      setMessage("Please enter a math question.");
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

    setImageLoading(true);
    setSolution("");
    setMessage("");
    setQuestion("Math problem from uploaded photo");

    try {
      const formData = new FormData();
      formData.append("image", imageFile);

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

  const practiceQuestion = parts["PRACTICE QUESTION"]
    ? parts["PRACTICE QUESTION"]
        .replace(/Great job![\s\S]*$/, "")
        .trim()
    : "";

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
                  solveQuestion();
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
                      disabled={imageLoading}
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
                        ? "🤖 Reading Photo..."
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
                  ? "🤖 EasyMath AI is thinking..."
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

                      <button
                        onClick={() => {
                          setQuestion(
                            practiceQuestion
                          );

                          setSolution("");

                          window.scrollTo({
                            top: 0,
                            behavior:
                              "smooth",
                          });
                        }}
                        style={{
                          marginTop: "16px",

                          border: "none",

                          background:
                            "#7c3aed",

                          color: "white",

                          padding:
                            "11px 17px",

                          borderRadius:
                            "11px",

                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Try This Question →
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