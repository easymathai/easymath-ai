/**
 * Lightweight looping "how it works" demo: photo in → problem read → steps
 * appear. Pure CSS animation (no video, no JS timers); respects reduced motion.
 */
export default function HowDemo({ dark, compact = false }: { dark: boolean; compact?: boolean }) {
  const text = dark ? "#e5e7eb" : "#0f172a";
  const muted = dark ? "#94a3b8" : "#64748b";
  const panel = dark ? "#111827" : "#ffffff";
  const border = dark ? "#334155" : "#e2e8f0";

  return (
    <div
      className={`em-demo${compact ? " em-demo--compact" : ""}`}
      aria-label="Demo: a photo of 2x + 7 = 19 is read, then solved step by step to x = 6"
      role="img"
      style={{
        background: dark
          ? "radial-gradient(500px 260px at 0% 0%, rgba(124,58,237,0.35), transparent 60%), radial-gradient(500px 260px at 100% 100%, rgba(37,99,235,0.3), transparent 60%), #0b1220"
          : "radial-gradient(500px 260px at 0% 0%, rgba(124,58,237,0.14), transparent 60%), radial-gradient(500px 260px at 100% 100%, rgba(37,99,235,0.14), transparent 60%), #f5f3ff",
        borderColor: border,
      }}
    >
      <style>{`
        .em-demo { position: relative; border: 1px solid; border-radius: 24px; overflow: hidden; display: grid; grid-template-columns: 1fr 1.25fr; gap: 22px; padding: 26px; min-height: 250px; align-items: center; }
        .em-demo--compact { border-radius: 0; border: none; min-height: 220px; padding: 26px 28px 8px; }
        .em-demo-steps-label { position: absolute; top: 14px; left: 26px; display: flex; gap: 8px; font-size: 11px; font-weight: 900; letter-spacing: .08em; }
        .em-demo-steps-label span { opacity: .35; animation: em-demo-tab 9s infinite; }
        .em-demo-steps-label span:nth-child(2) { animation-delay: 3s; }
        .em-demo-steps-label span:nth-child(3) { animation-delay: 6s; }
        @keyframes em-demo-tab { 0%, 30% { opacity: 1; color: #7C3AED; } 34%, 100% { opacity: .35; } }
        .em-demo-photo { position: relative; aspect-ratio: 4 / 3; border-radius: 16px; background: #fbf8ef; box-shadow: 0 16px 40px rgba(15,23,42,.18); transform: rotate(-3deg); overflow: hidden;
          background-image: repeating-linear-gradient(#fbf8ef 0 26px, #c9dbf2 26px 27px); margin-top: 14px; }
        .em-demo-photo b { position: absolute; inset: 0; display: grid; place-items: center; font: 600 clamp(20px, 2.4vw, 30px) "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive; color: #1e2a5a; }
        .em-demo-scan { position: absolute; left: 0; right: 0; height: 36%; top: -40%; background: linear-gradient(180deg, transparent, rgba(124,58,237,.35), transparent); border-bottom: 2px solid #7C3AED; animation: em-demo-scan 9s infinite; }
        @keyframes em-demo-scan { 0% { top: -40%; } 22% { top: 100%; } 23%, 100% { top: 140%; } }
        .em-demo-right { display: grid; gap: 8px; margin-top: 14px; }
        .em-demo-read, .em-demo-line, .em-demo-answer { opacity: 0; transform: translateY(8px); border-radius: 12px; padding: 9px 12px; font-size: 14px; font-weight: 700; animation: em-demo-in 9s infinite; }
        .em-demo-read { animation-delay: 2.2s; }
        .em-demo-line:nth-of-type(2) { animation-delay: 3.6s; }
        .em-demo-line:nth-of-type(3) { animation-delay: 4.6s; }
        .em-demo-answer { animation-delay: 5.8s; }
        @keyframes em-demo-in { 0% { opacity: 0; transform: translateY(8px); } 5% { opacity: 1; transform: none; } 70% { opacity: 1; transform: none; } 78%, 100% { opacity: 0; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .em-demo *, .em-demo-steps-label span { animation: none !important; }
          .em-demo-read, .em-demo-line, .em-demo-answer { opacity: 1; transform: none; }
          .em-demo-scan { display: none; }
        }
        @media (max-width: 680px) { .em-demo { grid-template-columns: 1fr; padding: 40px 18px 18px; } .em-demo-photo { max-width: 240px; margin: 6px auto 0; } }
      `}</style>
      <div className="em-demo-steps-label" style={{ color: muted }}>
        <span>1 SNAP</span>
        <span>2 SOLVE</span>
        <span>3 UNDERSTAND</span>
      </div>
      <div className="em-demo-photo" aria-hidden="true">
        <b>2x + 7 = 19</b>
        <div className="em-demo-scan" />
      </div>
      <div className="em-demo-right" aria-hidden="true">
        <div className="em-demo-read" style={{ background: dark ? "rgba(20,83,45,.5)" : "#ecfdf5", color: dark ? "#86EFAC" : "#047857", border: `1px solid ${dark ? "#166534" : "#a7f3d0"}` }}>
          ✓ We read: 2x + 7 = 19 — looks right?
        </div>
        <div className="em-demo-line" style={{ background: panel, color: text, border: `1px solid ${border}` }}>
          1. Subtract 7 from both sides → 2x = 12
        </div>
        <div className="em-demo-line" style={{ background: panel, color: text, border: `1px solid ${border}` }}>
          2. Divide both sides by 2 → x = 12 ÷ 2
        </div>
        <div className="em-demo-answer" style={{ background: "linear-gradient(135deg,#7C3AED,#2563EB)", color: "#fff" }}>
          Final answer: x = 6 ✨
        </div>
      </div>
    </div>
  );
}
