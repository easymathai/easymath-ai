import type { ReactNode } from "react";
import Link from "next/link";
import SiteFooter from "./site-footer";

export default function LegalShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, #1e3a8a 0%, transparent 28%), radial-gradient(circle at bottom right, #14532d 0%, transparent 28%), #0f172a",
        color: "#e5e7eb",
        padding: "22px 16px 36px",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        letterSpacing: "-0.011em",
      }}
    >
      <div
        style={{
          maxWidth: "760px",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            background: "rgba(15,23,42,0.94)",
            border: "1px solid #334155",
            borderRadius: "22px",
            padding: "16px 20px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/"
            style={{
              color: "#e5e7eb",
              textDecoration: "none",
              fontWeight: 900,
              fontSize: "18px",
              letterSpacing: "-0.03em",
            }}
          >
            EasyMath AI
          </Link>
          <Link
            href="/"
            style={{
              border: "1px solid #334155",
              background: "#1e293b",
              color: "#e5e7eb",
              padding: "9px 14px",
              borderRadius: "999px",
              fontWeight: 800,
              fontSize: "13px",
              textDecoration: "none",
            }}
          >
            Back to EasyMath
          </Link>
        </header>

        <article
          style={{
            background: "rgba(15,23,42,0.94)",
            border: "1px solid #334155",
            borderRadius: "24px",
            padding: "26px 24px",
            lineHeight: 1.7,
          }}
        >
          <h1
            style={{
              margin: "0 0 8px",
              fontSize: "28px",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1.15,
            }}
          >
            {title}
          </h1>
          <div
            style={{
              color: "#94a3b8",
              fontSize: "13px",
              fontWeight: 700,
              marginBottom: "22px",
            }}
          >
            Last updated 10 September 2026
          </div>
          <div className="easymath-legal">{children}</div>
        </article>

        <SiteFooter />
      </div>
      <style>{`
        .easymath-legal h2 {
          margin: 22px 0 8px;
          font-size: 17px;
          font-weight: 900;
          letter-spacing: -0.02em;
        }
        .easymath-legal p,
        .easymath-legal ul {
          margin: 0 0 12px;
          color: #cbd5e1;
          font-size: 15px;
        }
        .easymath-legal ul {
          padding-left: 20px;
        }
        .easymath-legal li {
          margin-bottom: 6px;
        }
        .easymath-legal a {
          color: #93c5fd;
          font-weight: 700;
        }
        @media (max-width: 520px) {
          .easymath-legal h2 { font-size: 16px; }
          .easymath-legal p, .easymath-legal ul { font-size: 14px; }
        }
      `}</style>
    </main>
  );
}
