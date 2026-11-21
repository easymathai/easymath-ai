import Link from "next/link";
import Image from "next/image";
import BrandLogo from "./brand-logo";

type LandingFooterProps = {
  dark: boolean;
  muted: string;
  text: string;
  border: string;
};

/** Full-width footer for the landing/solver page. Legal pages keep SiteFooter. */
export default function LandingFooter({ dark, muted, text, border }: LandingFooterProps) {
  const linkStyle = { color: muted, textDecoration: "none", fontWeight: 600 } as const;
  const headStyle = {
    color: text,
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: "0.06em",
    marginBottom: 14,
  } as const;

  return (
    <footer
      style={{
        borderTop: `1px solid ${border}`,
        background: dark ? "#08101d" : "#ffffff",
        color: muted,
        fontSize: 14,
      }}
    >
      <div className="em-container em-footer-grid">
        <div>
          <BrandLogo variant={dark ? "dark" : "light"} />
          <p style={{ margin: "14px 0 0", fontWeight: 700, color: text }}>
            Your Personal Ai Math Tutor
          </p>
          <p style={{ margin: "8px 0 0", lineHeight: 1.65, maxWidth: 320 }}>
            Snap or type any math problem and get clear, step-by-step help at your
            level. 5 free solves a day including 1 photo, no ads.
          </p>
        </div>
        <nav aria-label="Product">
          <div style={headStyle}>PRODUCT</div>
          <ul className="em-footer-list">
            <li><a href="#solver" style={linkStyle}>Solver</a></li>
            <li><a href="#practice" style={linkStyle}>Practice</a></li>
            <li><a href="#progress" style={linkStyle}>Progress</a></li>
            <li><a href="#plans" style={linkStyle}>Plans</a></li>
          </ul>
        </nav>
        <nav aria-label="Help">
          <div style={headStyle}>HELP</div>
          <ul className="em-footer-list">
            <li><Link href="/support" style={linkStyle}>Support</Link></li>
            <li><a href="#faq" style={linkStyle}>FAQ</a></li>
            <li><a href="#how-it-works" style={linkStyle}>How it works</a></li>
            <li><Link href="/delete-account" style={linkStyle}>Delete account</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <div style={headStyle}>LEGAL</div>
          <ul className="em-footer-list">
            <li><Link href="/privacy" style={linkStyle}>Privacy</Link></li>
            <li><Link href="/terms" style={linkStyle}>Terms</Link></li>
          </ul>
        </nav>
      </div>
      <div style={{ borderTop: `1px solid ${border}` }}>
        <div className="em-container em-footer-bottom">
          <span>© 2026 EasyMath Ai. All rights reserved.</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
            <Image
              src="/branding/zayir-ai-logo-purple-dark.png"
              alt="zayir.ai"
              width={24}
              height={24}
              style={{ borderRadius: 6 }}
            />
            <span>
              EasyMath Ai by <span style={{ color: text }}>zayir.ai</span>
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
