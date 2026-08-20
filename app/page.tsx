"use client";

import { useEffect, useMemo, useState } from "react";

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
    localStorage.setItem("easymath-theme", nextTheme ? "dark" : "light");
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
        ...history.filter((item) => item.question !== finalQuestion),
      ].slice(0, 10);

      saveHistory(updatedHistory);
    } catch {
      setSolution("Unable to connect to the solver.");
    } finally {
      setLoading(false);
    }
  }

  function clearEverything() {
    setQuestion("");
    setSolution("");
    setMessage("");
  }

  function clearHistory() {
    setHistory([]);
    localStorage.removeItem("easymath-history");
  }

  const parts = solution ? parseSolution(solution) : {};

  const practiceQuestion = parts["PRACTICE QUESTION"]
    ? parts["PRACTICE QUESTION"].replace(/Great job!.*$/s, "").trim()
    : "";

  const theme = useMemo(
    () => ({
      page: darkMode ? "#0f172a" : "#f8fafc",
      panel: darkMode ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.96)",
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
        transition: "all 0.25s ease",
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
            background: darkMode
              ? "rgba(15,23,42,0.88)"
              : "rgba(255,255,255,0.84)",
            border: `1px solid ${theme.border}`,
            borderRadius: "24px",
            padding: "18px 22px",
            boxShadow: theme.shadow,
            backdropFilter: "blur(16px)",
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
                    "linear-gradient(135deg, #2563eb 0%, #16a34a 100%)",
                  color: "white",
                  fontSize: "28px",
                  fontWeight: 900,
                  boxShadow: "0 12px 30px rgba(37,99,235,0.24)",
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
                    letterSpacing: "-0.8px",
                  }}
                >
                  EasyMath AI
                </h1>

                <p
                  style={{
                    margin: "4px 0 0",
                    color: theme.muted,
                    fontSize: "15px",
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
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "999px",
                  background: darkMode ? "#172554" : "#eff6ff",
                  color: darkMode ? "#bfdbfe" : "#1d4ed8",
                  fontWeight: 800,
                  fontSize: "13px",
                  border: darkMode
                    ? "1px solid #1d4ed8"
                    : "1px solid #dbeafe",
                }}
              >
                Making Math Easy for Everyone
              </div>

              <button
                onClick={toggleTheme}
                style={{
                  border: `1px solid ${theme.border}`,
                  background: theme.buttonSoft,
                  color: theme.text,
                  width: "46px",
                  height: "46px",
                  borderRadius: "14px",
                  cursor: "pointer",
                  fontSize: "20px",
                  boxShadow: darkMode
                    ? "none"
                    : "0 8px 20px rgba(15,23,42,0.05)",
                }}
                aria-label="Toggle theme"
              >
                {darkMode ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.8fr)",
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
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "999px",
                background: darkMode ? "#172554" : "#eef4ff",
                color: darkMode ? "#bfdbfe" : "#2563eb",
                fontSize: "12px",
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              ✨ Ask EasyMath
            </div>

            <h2
              style={{
                margin: "14px 0 8px",
                fontSize: "31px",
                lineHeight: 1.15,
                letterSpacing: "-0.6px",
              }}
            >
              What math problem can I help you solve?
            </h2>

            <p
              style={{
                margin: 0,
                color: theme.muted,
                lineHeight: 1.65,
                fontSize: "16px",
              }}
            >
              Type a calculation, percentage, square root, algebra equation,
              or word problem. EasyMath AI will explain every step clearly.
            </p>

            <textarea
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setMessage("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  solveQuestion();
                }
              }}
              placeholder="Example: Ali has 100 chocolates and shares them equally among 4 friends. How many does each friend get?"
              style={{
                width: "100%",
                minHeight: "155px",
                resize: "vertical",
                marginTop: "24px",
                padding: "19px",
                fontSize: "18px",
                lineHeight: 1.55,
                color: theme.text,
                background: theme.input,
                border: `1.5px solid ${theme.border}`,
                borderRadius: "17px",
                outline: "none",
                boxSizing: "border-box",
                boxShadow: darkMode
                  ? "inset 0 1px 2px rgba(0,0,0,0.18)"
                  : "inset 0 1px 2px rgba(15,23,42,0.03)",
              }}
            />

            {message && (
              <div
                style={{
                  marginTop: "10px",
                  color: "#f59e0b",
                  fontSize: "14px",
                  fontWeight: 700,
                }}
              >
                {message}
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                marginTop: "18px",
              }}
            >
              {examples.map((example) => (
                <button
                  key={example}
                  onClick={() => solveQuestion(example)}
                  disabled={loading}
                  style={{
                    border: `1px solid ${theme.border}`,
                    background: theme.buttonSoft,
                    color: theme.text,
                    padding: "10px 14px",
                    borderRadius: "12px",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "14px",
                    boxShadow: darkMode
                      ? "none"
                      : "0 4px 12px rgba(15,23,42,0.03)",
                  }}
                >
                  {example}
                </button>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "22px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => solveQuestion()}
                disabled={loading}
                style={{
                  border: "none",
                  background:
                    "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                  color: "white",
                  padding: "15px 26px",
                  borderRadius: "14px",
                  cursor: loading ? "wait" : "pointer",
                  fontWeight: 900,
                  fontSize: "16px",
                  boxShadow: "0 12px 26px rgba(37,99,235,0.25)",
                  opacity: loading ? 0.78 : 1,
                }}
              >
                {loading ? "🤖 EasyMath AI is thinking..." : "✨ Solve Now"}
              </button>

              <button
                onClick={clearEverything}
                disabled={loading}
                style={{
                  border: `1px solid ${theme.border}`,
                  background: theme.buttonSoft,
                  color: theme.text,
                  padding: "15px 22px",
                  borderRadius: "14px",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: "15px",
                }}
              >
                Clear
              </button>
            </div>

            {loading && (
              <div
                style={{
                  marginTop: "22px",
                  padding: "16px 18px",
                  background: darkMode ? "#172554" : "#f8fbff",
                  border: darkMode
                    ? "1px solid #1d4ed8"
                    : "1px solid #dbeafe",
                  borderRadius: "14px",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: darkMode ? "#bfdbfe" : "#1d4ed8",
                    marginBottom: "10px",
                  }}
                >
                  EasyMath AI is working on your solution
                </div>

                <div
                  style={{
                    height: "8px",
                    borderRadius: "999px",
                    overflow: "hidden",
                    background: darkMode ? "#1e3a8a" : "#dbeafe",
                  }}
                >
                  <div
                    style={{
                      width: "72%",
                      height: "100%",
                      borderRadius: "999px",
                      background:
                        "linear-gradient(90deg, #2563eb 0%, #16a34a 100%)",
                    }}
                  />
                </div>
              </div>
            )}

            {solution && !loading && (
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
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "15px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 900,
                        color: darkMode ? "#93c5fd" : "#2563eb",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      EasyMath AI Solution
                    </div>

                    <div
                      style={{
                        marginTop: "5px",
                        fontWeight: 800,
                        fontSize: "18px",
                      }}
                    >
                      {question}
                    </div>
                  </div>

                  <button
                    onClick={() => navigator.clipboard.writeText(solution)}
                    style={{
                      border: `1px solid ${theme.border}`,
                      background: theme.buttonSoft,
                      color: theme.text,
                      borderRadius: "11px",
                      padding: "10px 14px",
                      cursor: "pointer",
                      fontWeight: 800,
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
                        ? "linear-gradient(135deg, #052e16, #14532d)"
                        : "linear-gradient(135deg, #ecfdf5, #f0fdf4)",
                      border: darkMode
                        ? "1px solid #166534"
                        : "1px solid #bbf7d0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 900,
                        color: darkMode ? "#86efac" : "#15803d",
                        marginBottom: "10px",
                      }}
                    >
                      ✅ FINAL ANSWER
                    </div>

                    <div
                      style={{
                        fontSize: "26px",
                        fontWeight: 900,
                        lineHeight: 1.5,
                      }}
                    >
                      {parts["FINAL ANSWER"]}
                    </div>
                  </div>
                )}

                {parts["STEP-BY-STEP EXPLANATION"] && (
                  <div
                    style={{
                      padding: "22px",
                      borderRadius: "18px",
                      background: darkMode ? "#172554" : "#eff6ff",
                      border: darkMode
                        ? "1px solid #1d4ed8"
                        : "1px solid #bfdbfe",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 900,
                        color: darkMode ? "#93c5fd" : "#1d4ed8",
                        marginBottom: "12px",
                      }}
                    >
                      📘 STEP-BY-STEP EXPLANATION
                    </div>

                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.85,
                        fontSize: "16px",
                      }}
                    >
                      {parts["STEP-BY-STEP EXPLANATION"]}
                    </div>
                  </div>
                )}

                {parts["WHY IT WORKS"] && (
                  <div
                    style={{
                      padding: "22px",
                      borderRadius: "18px",
                      background: darkMode ? "#422006" : "#fffbeb",
                      border: darkMode
                        ? "1px solid #92400e"
                        : "1px solid #fde68a",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 900,
                        color: darkMode ? "#fcd34d" : "#b45309",
                        marginBottom: "10px",
                      }}
                    >
                      💡 WHY IT WORKS
                    </div>

                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.75,
                      }}
                    >
                      {parts["WHY IT WORKS"]}
                    </div>
                  </div>
                )}

                {parts["COMMON MISTAKE"] && (
                  <div
                    style={{
                      padding: "22px",
                      borderRadius: "18px",
                      background: darkMode ? "#4c0519" : "#fff1f2",
                      border: darkMode
                        ? "1px solid #9f1239"
                        : "1px solid #fecdd3",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 900,
                        color: darkMode ? "#fda4af" : "#be123c",
                        marginBottom: "10px",
                      }}
                    >
                      ⚠️ COMMON MISTAKE
                    </div>

                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.75,
                      }}
                    >
                      {parts["COMMON MISTAKE"]}
                    </div>
                  </div>
                )}

                {practiceQuestion && (
                  <div
                    style={{
                      padding: "22px",
                      borderRadius: "18px",
                      background: darkMode
                        ? "linear-gradient(135deg, #2e1065, #3b0764)"
                        : "linear-gradient(135deg, #faf5ff, #f5f3ff)",
                      border: darkMode
                        ? "1px solid #6d28d9"
                        : "1px solid #ddd6fe",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 900,
                        color: darkMode ? "#c4b5fd" : "#7c3aed",
                        marginBottom: "10px",
                      }}
                    >
                      🎯 YOUR TURN
                    </div>

                    <div
                      style={{
                        fontSize: "20px",
                        fontWeight: 800,
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {practiceQuestion}
                    </div>

                    <button
                      onClick={() => {
                        setQuestion(practiceQuestion);
                        setSolution("");
                        setMessage("");
                        window.scrollTo({
                          top: 0,
                          behavior: "smooth",
                        });
                      }}
                      style={{
                        marginTop: "16px",
                        border: "none",
                        background: "#7c3aed",
                        color: "white",
                        padding: "11px 17px",
                        borderRadius: "11px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Try This Question →
                    </button>
                  </div>
                )}

                <div
                  style={{
                    padding: "16px 20px",
                    textAlign: "center",
                    borderRadius: "16px",
                    background: theme.panelSoft,
                    border: `1px solid ${theme.border}`,
                    fontWeight: 800,
                    color: theme.muted,
                  }}
                >
                  🌟 Great job! Keep practising and you&apos;ll become stronger
                  at maths.
                </div>
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
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    fontWeight: 900,
                    color: "#16a34a",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Your Work
                </p>

                <h3
                  style={{
                    margin: "6px 0 0",
                    fontSize: "22px",
                  }}
                >
                  Recent Questions
                </h3>
              </div>

              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: theme.muted,
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: "13px",
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div
                style={{
                  padding: "20px",
                  borderRadius: "16px",
                  background: darkMode ? "#111827" : "#f8fafc",
                  color: theme.muted,
                  lineHeight: 1.6,
                  fontSize: "14px",
                }}
              >
                Your solved questions will appear here automatically.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                }}
              >
                {history.map((item, index) => (
                  <button
                    key={`${item.question}-${index}`}
                    onClick={() => {
                      setQuestion(item.question);
                      setSolution(item.solution);
                      setMessage("");
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "15px",
                      border: `1px solid ${theme.border}`,
                      borderRadius: "14px",
                      background: theme.buttonSoft,
                      cursor: "pointer",
                      color: theme.text,
                      boxShadow: darkMode
                        ? "none"
                        : "0 4px 12px rgba(15,23,42,0.03)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        lineHeight: 1.4,
                      }}
                    >
                      {item.question}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div
              style={{
                marginTop: "20px",
                padding: "18px",
                borderRadius: "17px",
                background: darkMode
                  ? "linear-gradient(135deg, #172554 0%, #14532d 100%)"
                  : "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
                border: `1px solid ${theme.border}`,
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  marginBottom: "7px",
                }}
              >
                Student Tip
              </div>

              <div
                style={{
                  color: theme.muted,
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                Press Enter to solve instantly. Use Shift + Enter when you want
                a new line.
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
          EasyMath AI • Learn the method, not just the answer.
        </p>
      </div>
    </main>
  );
}