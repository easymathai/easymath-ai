"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import MathText from "./math-text";

/**
 * Marketing sections for the desktop-first landing page (how it works,
 * features, subjects, value strip, plans, FAQ). Pure presentation: every
 * action is passed in from the solver page.
 */

export type LandingTheme = {
  text: string;
  muted: string;
  border: string;
  panel: string;
  panelSoft: string;
  shadow: string;
  shadowSoft: string;
};

type SectionProps = {
  dark: boolean;
  theme: LandingTheme;
};

const BRAND_GRADIENT = "linear-gradient(135deg,#7C3AED 0%,#2563EB 100%)";

export function SectionHead({
  eyebrow,
  title,
  subtitle,
  dark,
  theme,
  align = "center",
}: SectionProps & {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div
      className="em-section-head"
      style={{
        textAlign: align,
        marginLeft: align === "center" ? "auto" : 0,
        marginRight: align === "center" ? "auto" : 0,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          padding: "6px 12px",
          borderRadius: 999,
          background: dark ? "rgba(124,58,237,0.16)" : "#f3efff",
          color: dark ? "#c4b5fd" : "#6d28d9",
          border: `1px solid ${dark ? "rgba(124,58,237,0.35)" : "#e4dbff"}`,
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: "0.08em",
        }}
      >
        {eyebrow}
      </div>
      <h2 className="em-h2" style={{ color: theme.text }}>
        {title}
      </h2>
      {subtitle ? (
        <p className="em-lead" style={{ color: theme.muted }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function card(theme: LandingTheme, extra: CSSProperties = {}): CSSProperties {
  return {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: 22,
    boxShadow: theme.shadowSoft,
    ...extra,
  };
}

const STEPS = [
  {
    n: "1",
    icon: "📸",
    title: "Snap it",
    body: "Take a photo of printed or handwritten math, drop in a screenshot, or just type the question.",
  },
  {
    n: "2",
    icon: "✨",
    title: "Solve it",
    body: "We read your photo first and you check it — free. Then EasyMath Ai solves it step by step.",
  },
  {
    n: "3",
    icon: "🧠",
    title: "Understand it",
    body: "See why each step works, the common mistake to avoid, and a practice question to lock it in.",
  },
];

export function HowItWorks({ dark, theme }: SectionProps) {
  return (
    <section id="how-it-works" className="em-section">
      <div className="em-container">
        <SectionHead
          dark={dark}
          theme={theme}
          eyebrow="HOW IT WORKS"
          title="Snap it · Solve it · Understand it"
          subtitle="From stuck to confident in three steps — on your laptop, tablet or phone."
        />
        <div className="em-grid-3">
          {STEPS.map((step) => (
            <div key={step.n} style={card(theme, { padding: 28 })}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    display: "grid",
                    placeItems: "center",
                    background: BRAND_GRADIENT,
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 18,
                    boxShadow: "0 10px 24px rgba(91,59,232,0.3)",
                  }}
                >
                  {step.n}
                </span>
                <span aria-hidden="true" style={{ fontSize: 26 }}>
                  {step.icon}
                </span>
              </div>
              <h3 className="em-h3" style={{ color: theme.text }}>
                {step.title}
              </h3>
              <p style={{ margin: 0, color: theme.muted, lineHeight: 1.65 }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: "📷",
    title: "Photo or typed questions",
    body: "Printed worksheets, handwriting, screenshots or typed equations — drag, drop, paste or snap.",
  },
  {
    icon: "✅",
    title: "Check what we read — free",
    body: "Edit the problem we read from your photo before it uses a solve. A bad read never costs you.",
  },
  {
    icon: "∑",
    title: "Real math notation",
    body: "Fractions, powers, roots and equations shown the way your teacher writes them.",
  },
  {
    icon: "🎯",
    title: "Explained at your level",
    body: "Primary, middle school, high school or advanced — same right answer, explained for you.",
  },
  {
    icon: "📝",
    title: "Practice & mistake review",
    body: "5-question practice sets by topic, hints when you're stuck, and a review queue for misses.",
  },
  {
    icon: "📈",
    title: "Progress you can see",
    body: "Accuracy, streaks and topic mastery, synced across devices when you log in.",
  },
];

export function Features({ dark, theme }: SectionProps) {
  return (
    <section
      id="features"
      className="em-section"
      style={{ background: dark ? "#0d1628" : "#f4f6fb" }}
    >
      <div className="em-container">
        <SectionHead
          dark={dark}
          theme={theme}
          eyebrow="FEATURES"
          title="A tutor, not just an answer"
          subtitle="Everything you need to finish homework and actually get better at math."
        />
        <div className="em-grid-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} style={card(theme, { padding: 26 })}>
              <div
                aria-hidden="true"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                  fontWeight: 900,
                  color: dark ? "#86EFAC" : "#059669",
                  background: dark ? "rgba(134,239,172,0.1)" : "#ecfdf5",
                  border: `1px solid ${dark ? "rgba(134,239,172,0.25)" : "#bbf7d0"}`,
                }}
              >
                {feature.icon}
              </div>
              <h3 className="em-h3" style={{ color: theme.text }}>
                {feature.title}
              </h3>
              <p style={{ margin: 0, color: theme.muted, lineHeight: 1.65 }}>
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const SUBJECTS = [
  {
    level: "Primary",
    ages: "Ages 5–11",
    topics: ["Addition & subtraction", "Times tables", "Fractions", "Decimals", "Measurement", "Word problems"],
  },
  {
    level: "Middle School",
    ages: "Ages 11–14",
    topics: ["Ratios & rates", "Percentages", "Integers", "Linear equations", "Area & volume", "Statistics"],
  },
  {
    level: "High School",
    ages: "Ages 14–18",
    topics: ["Algebra", "Quadratics", "Functions & graphs", "Trigonometry", "Geometry", "Probability"],
  },
  {
    level: "Advanced",
    ages: "Calculus-ready",
    topics: ["Limits", "Derivatives", "Integrals", "Logarithms", "Sequences & series", "Vectors"],
  },
];

export function Subjects({ dark, theme }: SectionProps) {
  return (
    <section id="subjects" className="em-section">
      <div className="em-container">
        <SectionHead
          dark={dark}
          theme={theme}
          eyebrow="SUBJECTS & TOPICS"
          title="From times tables to calculus"
          subtitle="Pick your level once and every explanation fits you."
        />
        <div className="em-grid-4">
          {SUBJECTS.map((subject) => (
            <div key={subject.level} style={card(theme, { padding: 24 })}>
              <div style={{ fontWeight: 900, fontSize: 18, color: theme.text }}>
                {subject.level}
              </div>
              <div style={{ marginTop: 4, color: theme.muted, fontSize: 14, fontWeight: 700 }}>
                {subject.ages}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                {subject.topics.map((topic) => (
                  <span
                    key={topic}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: theme.text,
                      background: dark ? "#111c33" : "#f1f5f9",
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const VALUE_POINTS = [
  { big: "5", label: "free solves a day, incl. 1 photo" },
  { big: "0", label: "ads — nothing between you and the answer" },
  { big: "0", label: "sign-ups needed to start" },
  { big: "Free", label: "photo read checks — they never use a solve" },
];

const COMPARE_ROWS: { label: string; us: string; others: string }[] = [
  { label: "Step-by-step explanations", us: "Free, every solve", others: "Often behind a paywall" },
  { label: "Ads", us: "None", others: "Common on free plans" },
  { label: "Check the photo read before solving", us: "Yes — free", others: "Rare" },
  { label: "Explanations at your level", us: "4 levels", others: "Usually one style" },
  { label: "Start without an account", us: "Yes", others: "Often required" },
];

export function ValueStrip({
  dark,
  theme,
  onStart,
}: SectionProps & { onStart: () => void }) {
  return (
    <section className="em-section" style={{ paddingTop: 0 }}>
      <div className="em-container">
        <div
          className="em-value"
          style={{
            background: dark
              ? "linear-gradient(135deg,#2e1065 0%,#172554 60%,#0b1220 100%)"
              : "linear-gradient(135deg,#5B3BE8 0%,#2563EB 100%)",
            borderRadius: 28,
            color: "#fff",
            boxShadow: "0 30px 80px rgba(37,99,235,0.25)",
          }}
        >
          <div className="em-value-copy">
            <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.1em", color: "#c7d2fe" }}>
              FREE, FOR REAL
            </div>
            <h2 className="em-h2" style={{ color: "#fff", marginTop: 10 }}>
              5 free solves a day, including 1 photo.
              <br />
              No ads. No card.
            </h2>
            <p style={{ color: "#dbeafe", lineHeight: 1.65, margin: "12px 0 22px", fontSize: 17 }}>
              The full step-by-step explanation is part of every free solve — not a
              premium extra. Practice never uses your daily solves.
            </p>
            <button type="button" onClick={onStart} className="em-btn em-btn-light">
              Start solving free
            </button>
            <div className="em-value-stats">
              {VALUE_POINTS.map((point) => (
                <div key={point.label}>
                  <div style={{ fontSize: 30, fontWeight: 900, color: "#86EFAC" }}>{point.big}</div>
                  <div style={{ fontSize: 14, color: "#dbeafe", fontWeight: 600, lineHeight: 1.4 }}>
                    {point.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div
            className="em-compare"
            style={{
              background: dark ? "rgba(11,18,32,0.55)" : "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 20,
            }}
          >
            <div className="em-compare-row em-compare-head">
              <span />
              <span>EasyMath Ai</span>
              <span>Many math apps</span>
            </div>
            {COMPARE_ROWS.map((row) => (
              <div key={row.label} className="em-compare-row">
                <span style={{ fontWeight: 700 }}>{row.label}</span>
                <span style={{ color: "#86EFAC", fontWeight: 800 }}>✓ {row.us}</span>
                <span style={{ color: "#cbd5e1" }}>{row.others}</span>
              </div>
            ))}
          </div>
        </div>
        <p style={{ color: theme.muted, fontSize: 13, textAlign: "center", marginTop: 12 }}>
          Comparison reflects common free-plan limits across popular math apps and may vary by app and region.
        </p>
      </div>
    </section>
  );
}

export function Plans({
  dark,
  theme,
  onStart,
  onDetails,
}: SectionProps & { onStart: () => void; onDetails: () => void }) {
  const free = [
    "5 Ai solver questions a day, including 1 photo",
    "Photo solver with free read check",
    "Full step-by-step explanations",
    "Practice mode & mistake review",
    "Student level selection",
    "Progress tracking",
  ];
  const pro = [
    "Unlimited Ai solver questions",
    "Unlimited photo solver",
    "Everything in Free",
    "Priority access to new features",
  ];

  return (
    <section
      id="plans"
      className="em-section"
      style={{ background: dark ? "#0d1628" : "#f4f6fb" }}
    >
      <div className="em-container">
        <SectionHead
          dark={dark}
          theme={theme}
          eyebrow="PLANS"
          title="Start free. Stay free if you like."
          subtitle="Free covers most homework nights. Pro, for unlimited solving, is coming soon."
        />
        <div className="em-plans">
          <div style={card(theme, { padding: 30 })}>
            <div style={{ fontWeight: 900, letterSpacing: "0.08em", fontSize: 14, color: dark ? "#86EFAC" : "#059669" }}>
              FREE
            </div>
            <div style={{ fontSize: 40, fontWeight: 900, marginTop: 8, color: theme.text }}>
              AED 0
            </div>
            <div style={{ color: theme.muted, fontWeight: 600 }}>No card, no ads</div>
            <ul className="em-checklist" style={{ color: theme.text }}>
              {free.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button type="button" onClick={onStart} className="em-btn em-btn-primary" style={{ width: "100%" }}>
              Start solving free
            </button>
          </div>
          <div
            style={card(theme, {
              padding: 30,
              border: `1px solid ${dark ? "rgba(124,58,237,0.55)" : "#d8ccff"}`,
              background: dark
                ? "linear-gradient(160deg,#2e1065 0%,#172554 55%,#0b1220 100%)"
                : "linear-gradient(160deg,#faf5ff 0%,#eff6ff 55%,#ffffff 100%)",
            })}
          >
            <div style={{ fontWeight: 900, letterSpacing: "0.08em", fontSize: 14, color: dark ? "#c4b5fd" : "#6d28d9" }}>
              PRO
            </div>
            <div style={{ fontSize: 40, fontWeight: 900, marginTop: 8, color: theme.text }}>
              Coming soon
            </div>
            <div style={{ color: theme.muted, fontWeight: 600 }}>Unlimited solving when Pro launches</div>
            <ul className="em-checklist" style={{ color: theme.text }}>
              {pro.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button type="button" onClick={onDetails} className="em-btn em-btn-ghost" style={{ width: "100%", color: theme.text, borderColor: theme.border }}>
              See plan details
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "Is EasyMath Ai really free?",
    a: "Yes. You get 5 solver questions every day, including 1 photo solve, with full step-by-step explanations, no ads and no card. Practice questions don't use your daily solves.",
  },
  {
    q: "Do I need an account?",
    a: "No — you can start solving right away as a guest. A free account saves your progress, practice and history across devices.",
  },
  {
    q: "Does reading a photo use one of my solves?",
    a: "No. We read the math from your photo first and show it to you. You can fix anything, and only pressing Solve uses a solve. If the photo can't be read, nothing is used. Free and guest plans include 1 photo solve a day; after that, type the question.",
  },
  {
    q: "Which levels and topics are covered?",
    a: "Primary, middle school, high school and advanced (calculus-ready): arithmetic, fractions, percentages, algebra, geometry, trigonometry, statistics, calculus and more.",
  },
  {
    q: "What if an answer looks wrong?",
    a: "Tap “Report wrong answer” under the solution and tell us what looks off. We review every report to make EasyMath Ai better.",
  },
  {
    q: "Is there a mobile app?",
    a: "The website works great on any phone, and the EasyMath Ai Android app is on its way to Google Play.",
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        You can delete it from Account in the app, or follow the steps on our{" "}
        <Link href="/delete-account" style={{ color: "#2563eb", fontWeight: 700 }}>
          delete account page
        </Link>
        .
      </>
    ),
  },
];

export function Faq({ dark, theme }: SectionProps) {
  return (
    <section id="faq" className="em-section">
      <div className="em-container em-faq-wrap">
        <SectionHead
          dark={dark}
          theme={theme}
          eyebrow="FAQ"
          title="Questions, answered"
          align="left"
          subtitle={
            <>
              Still stuck? Visit{" "}
              <Link href="/support" style={{ color: "#2563eb", fontWeight: 700 }}>
                Support
              </Link>
              .
            </>
          }
        />
        <div style={{ display: "grid", gap: 12 }}>
          {FAQS.map((item) => (
            <details key={item.q} className="em-faq" style={card(theme, { padding: "18px 22px" })}>
              <summary style={{ color: theme.text }}>{item.q}</summary>
              <div style={{ color: theme.muted, lineHeight: 1.7, marginTop: 10 }}>{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

const SAMPLE_SOLUTION =
  "1. Subtract 5 from both sides: $2x = 10$\n2. Divide both sides by 2: $$x = \\frac{10}{2} = 5$$";

/** Empty state for the solution panel: shows what an answer looks like. */
export function SolutionPreview({ dark, theme }: SectionProps) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <span
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            borderRadius: 16,
            display: "grid",
            placeItems: "center",
            background: BRAND_GRADIENT,
            color: "#fff",
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          ✨
        </span>
        <div>
          <div style={{ fontWeight: 900, fontSize: 19, color: theme.text }}>
            Your step-by-step solution appears here
          </div>
          <div style={{ color: theme.muted, marginTop: 4, lineHeight: 1.5 }}>
            Ask a question or add a photo. Here&apos;s what an answer looks like:
          </div>
        </div>
      </div>
      <div
        style={{
          borderRadius: 18,
          border: `1px dashed ${theme.border}`,
          padding: 20,
          display: "grid",
          gap: 12,
          opacity: 0.92,
        }}
      >
        <div style={{ fontWeight: 800, color: theme.text }}>
          <MathText text="Example: solve $2x + 5 = 15$" block={false} />
        </div>
        <div
          style={{
            borderRadius: 14,
            padding: "12px 16px",
            background: dark ? "rgba(20,83,45,0.45)" : "#ecfdf5",
            border: `1px solid ${dark ? "#166534" : "#bbf7d0"}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.08em", color: dark ? "#86EFAC" : "#15803d" }}>
            FINAL ANSWER
          </div>
          <MathText text="$x = 5$" style={{ fontSize: 20, marginTop: 4, color: theme.text }} />
        </div>
        <div
          style={{
            borderRadius: 14,
            padding: "12px 16px",
            background: dark ? "rgba(23,37,84,0.6)" : "#eff6ff",
            border: `1px solid ${dark ? "#1e3a8a" : "#bfdbfe"}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.08em", color: dark ? "#93c5fd" : "#1d4ed8" }}>
            STEP-BY-STEP
          </div>
          <MathText
            text={SAMPLE_SOLUTION}
            style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 4, color: theme.text }}
          />
        </div>
      </div>
    </div>
  );
}
