import Link from "next/link";

type SiteFooterProps = {
  muted?: string;
  compact?: boolean;
};

export default function SiteFooter({
  muted = "#94a3b8",
  compact = false,
}: SiteFooterProps) {
  return (
    <footer
      style={{
        marginTop: compact ? "24px" : "36px",
        paddingTop: compact ? "0" : "18px",
        borderTop: compact ? "none" : "1px solid #334155",
        textAlign: "center",
        color: muted,
        fontSize: "13px",
        fontWeight: 600,
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "8px 14px",
          flexWrap: "wrap",
        }}
      >
        <Link href="/privacy" style={{ color: muted, textDecoration: "none" }}>
          Privacy
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms" style={{ color: muted, textDecoration: "none" }}>
          Terms
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/support" style={{ color: muted, textDecoration: "none" }}>
          Support
        </Link>
      </div>
      <div style={{ marginTop: "8px" }}>
        © 2026 EasyMath AI
      </div>
    </footer>
  );
}
