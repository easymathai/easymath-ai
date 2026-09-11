import type { Metadata } from "next";
import LegalShell from "../legal-shell";
import { getSupportEmail } from "@/lib/support";

export const metadata: Metadata = {
  title: "Support | EasyMath AI",
  description: "How to get help with EasyMath AI.",
};

export default function SupportPage() {
  const supportEmail = getSupportEmail();

  return (
    <LegalShell title="Support">
      <p>
        EasyMath AI is an educational math tutor. Use this page if you need
        help with the product.
      </p>

      <h2>Before you write</h2>
      <ul>
        <li>Try the question again, or use a clearer photo.</li>
        <li>Practice Mode does not use the daily solver limit.</li>
        <li>Guest progress stays in this browser unless you log in.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Email{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
        . Please include what you were trying to do and whether you were signed
        in.
      </p>

      <h2>Accounts</h2>
      <p>
        If you already have an EasyMath account, open Account in the app to see
        your email, sign out, or permanently delete your account and saved
        cloud progress (you will be asked to type DELETE to confirm).
      </p>
    </LegalShell>
  );
}
