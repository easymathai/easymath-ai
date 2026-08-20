"use client";

import { useEffect, useState } from "react";

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
  }, []);

  function saveHistory(items: HistoryItem[]) {
    setHistory(items);
    localStorage.setItem("easymath-history", JSON.stringify(items));
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

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, #dbeafe 0%, transparent 35%), radial-gradient(circle at bottom right, #dcfce7 0%, transparent 35%), #f8fafc",
        padding: "28px 18px 40px",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        color: "#172033",
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
            background: "rgba(255,255,255,0.82)",
            border: "1px solid rgba(148,163,184,0.18)",
            borderRadius: "24px",
            padding: "22px 24px",
            boxShadow: "0 18px 50px rgba(15,23,42,0.08)",
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
                    color: "#64748b",
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
                padding: "11px 15px",
                borderRadius: "999px",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontWeight: 800,
                fontSize: "13px",
                border: "1px solid #dbeafe",
              }}
            >
              Making Math Easy for Everyone
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
              background: "rgba(255,255,255,0.96)",
              border: "1px solid rgba(148,163,184,0.18)",
              borderRadius: "26px",
              padding: "30px",
              boxShadow: "0 20px 55px rgba(15,23,42,0.08)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "999px",
                background: "#eef4ff",
                color: "#2563eb",
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
                color: "#64748b",
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
                color: "#172033",
                background: "#fbfdff",
                border: "1.5px solid #dbe4f0",
                borderRadius: "17px",
                outline: "none",
                boxSizing: "border-box",
                boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
              }}
            />

            {message && (
              <div
                style={{
                  marginTop: "10px",
                  color: "#b45309",
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
                    border: "1px solid #dbe4f0",
                    background: "#ffffff",
                    color: "#334155",
                    padding: "10px 14px",
                    borderRadius: "12px",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "14px",
                    boxShadow: "0 4px 12px rgba(15,23,42,0.03)",
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
                  border: "1px solid #dbe4f0",
                  background: "white",
                  color: "#475569",
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
                  background: "#f8fbff",
                  border: "1px solid #dbeafe",
                  borderRadius: "14px",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "#1d4ed8",
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
                    background: "#dbeafe",
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
                        color: "#2563eb",
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
                      border: "1px solid #cbd5e1",
                      background: "white",
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
                      background: "linear-gradient(135deg, #ecfdf5, #f0fdf4)",
                      border: "1px solid #bbf7d0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 900,
                        color: "#15803d",
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
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 900,
                        color: "#1d4ed8",
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
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 900,
                        color: "#b45309",
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
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 900,
                        color: "#be123c",
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
                      background: "linear-gradient(135deg, #faf5ff, #f5f3ff)",
                      border: "1px solid #ddd6fe",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 900,
                        color: "#7c3aed",
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
                    background: "white",
                    border: "1px solid #e2e8f0",
                    fontWeight: 800,
                    color: "#475569",
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
              background: "rgba(255,255,255,0.94)",
              border: "1px solid rgba(148,163,184,0.18)",
              borderRadius: "26px",
              padding: "23px",
              boxShadow: "0 20px 50px rgba(15,23,42,0.06)",
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
                    color: "#64748b",
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
                  background: "#f8fafc",
                  color: "#64748b",
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
                      border: "1px solid #e2e8f0",
                      borderRadius: "14px",
                      background: "white",
                      cursor: "pointer",
                      color: "#263244",
                      boxShadow: "0 4px 12px rgba(15,23,42,0.03)",
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
                background:
                  "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
                border: "1px solid #e2ebf6",
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
                  color: "#64748b",
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
            color: "#94a3b8",
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