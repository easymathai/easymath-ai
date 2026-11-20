type BrandLogoProps = {
  variant?: "light" | "dark";
  size?: "default" | "sm";
};

export default function BrandLogo({
  variant = "dark",
  size = "default",
}: BrandLogoProps) {
  const src =
    variant === "dark"
      ? "/branding/header-logo-dark.svg"
      : "/branding/header-logo-light.svg";
  const className =
    size === "sm"
      ? "easymath-brand-logo easymath-brand-logo--sm"
      : "easymath-brand-logo";

  return (
    // Local SVG lockup: next/image does not optimize SVGs.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="EasyMath Ai"
      width={173}
      height={36}
      className={className}
    />
  );
}
