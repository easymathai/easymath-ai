/**
 * Branded solving loader: the √M mark gently pulses and draws in while status
 * lines rotate. Pure CSS (no timers); respects reduced motion.
 */
const LINES = {
  solve: ["Reading your problem…", "Working out the steps…", "Checking the answer…"],
  read: ["Reading your photo…", "Finding the math…", "Almost ready…"],
};

export default function SolvingLoader({
  mode = "solve",
  compact = false,
  dark = false,
}: {
  mode?: "solve" | "read";
  compact?: boolean;
  dark?: boolean;
}) {
  const lines = LINES[mode];

  return (
    <span
      className={`em-loader${compact ? " em-loader--compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={lines[0]}
    >
      <style>{`
        .em-loader { display: inline-flex; align-items: center; gap: 14px; }
        .em-loader-mark { position: relative; width: 56px; height: 56px; flex-shrink: 0; display: grid; place-items: center; }
        .em-loader-mark::before { content: ""; position: absolute; inset: -6px; border-radius: 50%; background: radial-gradient(circle, rgba(124,58,237,.35), transparent 65%); animation: em-loader-glow 1.8s ease-in-out infinite; }
        .em-loader-mark img { position: relative; width: 100%; height: auto; animation: em-loader-pulse 1.8s ease-in-out infinite, em-loader-draw 3.6s ease-in-out infinite; }
        .em-loader-lines { position: relative; display: inline-block; height: 1.5em; min-width: 13.5em; overflow: hidden; font-weight: 800; }
        .em-loader-lines > span { position: absolute; left: 0; top: 0; white-space: nowrap; opacity: 0; animation: em-loader-line 6s infinite; }
        .em-loader-lines > span:nth-child(2) { animation-delay: 2s; }
        .em-loader-lines > span:nth-child(3) { animation-delay: 4s; }
        .em-loader--compact { gap: 8px; }
        .em-loader--compact .em-loader-mark { width: 22px; height: 22px; }
        .em-loader--compact .em-loader-mark::before { display: none; }
        .em-loader--compact .em-loader-mark img { filter: brightness(0) invert(1); }
        .em-loader--compact .em-loader-lines { min-width: 11em; }
        @keyframes em-loader-pulse { 0%, 100% { transform: scale(.92); } 50% { transform: scale(1.06); } }
        @keyframes em-loader-glow { 0%, 100% { opacity: .35; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.1); } }
        @keyframes em-loader-draw { 0% { clip-path: inset(0 100% 0 0); } 40%, 85% { clip-path: inset(0 0 0 0); } 100% { clip-path: inset(0 0 0 0); opacity: .85; } }
        @keyframes em-loader-line { 0% { opacity: 0; transform: translateY(70%); } 5%, 30% { opacity: 1; transform: none; } 36%, 100% { opacity: 0; transform: translateY(-70%); } }
        @media (prefers-reduced-motion: reduce) {
          .em-loader-mark img, .em-loader-mark::before { animation: none; }
          .em-loader-lines > span { animation: none; }
          .em-loader-lines > span:first-child { opacity: 1; }
        }
      `}</style>
      <span className="em-loader-mark" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/branding/vm-mark-gradient.svg" alt="" width={56} height={56} />
      </span>
      <span className="em-loader-lines" style={{ color: compact ? "#fff" : dark ? "#e5e7eb" : "#0f172a" }}>
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </span>
  );
}
