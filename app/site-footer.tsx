import Link from "next/link";
import Image from "next/image";
import BrandLogo from "./brand-logo";

type SiteFooterProps = {
  muted?: string;
  compact?: boolean;
  variant?: "light" | "dark";
};

export default function SiteFooter({
  muted = "#94a3b8",
  compact = false,
  variant = "dark",
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
        <span aria-hidden="true">·</span>
        <Link href="/delete-account" style={{ color: muted, textDecoration: "none" }}>
          Delete account
        </Link>
      </div>
      <div style={{ marginTop: "8px" }}>© 2026 EasyMath Ai</div>
      <p
        style={{
          margin: "12px 0 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          color: muted,
          fontSize: 13,
          fontWeight: 600,
          flexWrap: "wrap",
        }}
      >
        <BrandLogo variant={variant} size="sm" />
        <span>by</span>
        <Image
          src="/branding/zayir-ai-logo-purple-dark.png"
          alt="zayir.ai"
          width={24}
          height={24}
        />
      </p>
    </footer>
  );
}
