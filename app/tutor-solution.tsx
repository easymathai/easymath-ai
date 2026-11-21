"use client";

import { useState } from "react";
import MathText from "./math-text";

type Theme = { text: string; muted: string; border: string; buttonSoft: string; shadowSoft: string };

type Step = { body: string; why: string };

/** Splits "1. … / Why: …" step text into steps. Falls back to one step. */
export function parseSteps(text: string): Step[] {
  const steps: Step[] = [];

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      continue;
    }

    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const why = line.match(/^\s*(?:[-–•]\s*)?why\s*:\s*(.*)$/i);

    if (numbered) {
      steps.push({ body: numbered[1], why: "" });
    } else if (why && steps.length > 0) {
      const current = steps[steps.length - 1];
      current.why = current.why ? `${current.why} ${why[1]}` : why[1];
    } else if (steps.length > 0) {
      steps[steps.length - 1].body += `\n${line.trim()}`;
    } else {
      steps.push({ body: line.trim(), why: "" });
    }
  }

  return steps;
}

/**
 * Tutor-style solution: answer first, then steps revealed one at a time with
 * a short "why", then the big idea and the common mistake. Not a chat log.
 */
export default function TutorSolution({
  finalAnswer,
  stepsText,
  whyItWorks,
  commonMistake,
  imageSrc,
  dark,
  theme,
  busy,
  onExplainSimpler,
  onSimilar,
  onReport,
}: {
  finalAnswer?: string;
  stepsText?: string;
  whyItWorks?: string;
  commonMistake?: string;
  imageSrc?: string;
  dark: boolean;
  theme: Theme;
  busy: boolean;
  onExplainSimpler: () => void;
  onSimilar: () => void;
  onReport: () => void;
}) {
  const steps = parseSteps(stepsText || "");
  const [shown, setShown] = useState(1);
  const visible = Math.min(shown, steps.length);
  const allShown = visible >= steps.length;

  const chip = {
    border: `1px solid ${theme.border}`,
    background: theme.buttonSoft,
    color: theme.text,
    borderRadius: 999,
    padding: "9px 14px",
    fontWeight: 800,
    fontSize: 13.5,
    cursor: "pointer",
  } as const;

  return (
    <div className="em-tutor">
      {imageSrc ? (
        <div className="em-tutor-photo" style={{ borderColor: theme.border, color: theme.muted }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="Your problem photo" />
          <span>Solved from your photo</span>
        </div>
      ) : null}

      {finalAnswer ? (
        <div
          className="em-tutor-answer"
          style={{
            background: dark
              ? "linear-gradient(135deg, rgba(124,58,237,0.22), rgba(16,185,129,0.16))"
              : "linear-gradient(135deg, #f5f3ff, #ecfdf5)",
            border: `1px solid ${dark ? "rgba(134,239,172,0.35)" : "#c4b5fd"}`,
          }}
        >
          <div className="em-tutor-kicker" style={{ color: dark ? "#86EFAC" : "#059669" }}>
            ANSWER
          </div>
          <MathText text={finalAnswer} style={{ fontSize: 22, fontWeight: 800, color: theme.text }} />
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className="em-tutor-steps">
          <div className="em-tutor-kicker" style={{ color: "#7C3AED" }}>
            STEP BY STEP · {visible} of {steps.length}
          </div>
          <ol>
            {steps.slice(0, visible).map((step, index) => (
              <li key={index} className="em-tutor-step" style={{ borderColor: theme.border }}>
                <span className="em-tutor-num" aria-hidden="true">{index + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <MathText text={step.body} style={{ whiteSpace: "pre-wrap", lineHeight: 1.75, color: theme.text }} />
                  {step.why ? (
                    <div className="em-tutor-why" style={{ color: theme.muted }}>
                      <strong style={{ color: dark ? "#86EFAC" : "#059669" }}>Why:</strong>{" "}
                      <MathText text={step.why} block={false} />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {!allShown ? (
            <div className="em-tutor-reveal">
              <button type="button" className="em-btn em-btn-primary em-btn-sm" onClick={() => setShown(visible + 1)}>
                Show next step
              </button>
              <button
                type="button"
                className="em-btn em-btn-ghost em-btn-sm"
                onClick={() => setShown(steps.length)}
                style={{ color: theme.text, borderColor: theme.border }}
              >
                Show all steps
              </button>
              <span style={{ color: theme.muted, fontSize: 13, fontWeight: 600 }}>
                Try the next step yourself first 💡
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {allShown && (whyItWorks || commonMistake) ? (
        <div className="em-tutor-notes">
          {whyItWorks ? (
            <div style={{ borderColor: dark ? "#854d0e" : "#fde68a", background: dark ? "rgba(133,77,14,0.2)" : "#fffbeb" }}>
              <div className="em-tutor-kicker" style={{ color: dark ? "#fcd34d" : "#b45309" }}>THE BIG IDEA</div>
              <MathText text={whyItWorks} style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, color: theme.text }} />
            </div>
          ) : null}
          {commonMistake ? (
            <div style={{ borderColor: dark ? "#7f1d1d" : "#fecaca", background: dark ? "rgba(127,29,29,0.22)" : "#fef2f2" }}>
              <div className="em-tutor-kicker" style={{ color: dark ? "#fca5a5" : "#b91c1c" }}>WATCH OUT</div>
              <MathText text={commonMistake} style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, color: theme.text }} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="em-tutor-chips">
        <button type="button" style={chip} onClick={onExplainSimpler} disabled={busy} title="Re-explains at a simpler level (uses 1 solve)">
          🧒 Explain simpler
        </button>
        <button type="button" style={chip} onClick={onSimilar} disabled={busy} title="Starts a practice set (doesn't use your solves)">
          🔁 Try a similar problem
        </button>
        <button type="button" style={chip} onClick={onReport}>
          🚩 Report wrong answer
        </button>
      </div>
    </div>
  );
}
