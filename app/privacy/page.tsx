import type { Metadata } from "next";
import LegalShell from "../legal-shell";
import { getSupportEmail } from "@/lib/support";

export const metadata: Metadata = {
  title: "Privacy | EasyMath AI",
  description:
    "How EasyMath AI handles accounts, progress, math questions, photos, and related service data.",
};

export default function PrivacyPage() {
  const supportEmail = getSupportEmail();

  return (
    <LegalShell title="Privacy">
      <p>
        This page describes how EasyMath AI handles information, based on how
        the current app works. It is not a certification, and it does not mean
        EasyMath is approved for every school or child-privacy law.
      </p>

      <h2>What EasyMath does</h2>
      <p>
        EasyMath is an educational math tool. You can type a question, upload a
        photo of a math problem, get a step-by-step solution, and use Practice
        Mode. A Free plan currently allows 10 solver questions per day. Practice
        does not use that solver limit.
      </p>

      <h2>Accounts</h2>
      <p>
        If you create an account, we store the email address and password you
        use to sign up. Passwords are handled by our authentication provider,
        not shown back to you in EasyMath. Signed-in progress can include your
        student level, practice topic, solver history, practice scores, topic
        stats, activity, and mistakes saved for review.
      </p>

      <h2>Guest use</h2>
      <p>
        You can use EasyMath without an account. Guest progress and settings
        such as theme, student level, practice topic, local stats, solver
        history, and saved mistakes are kept in this browser with localStorage.
        Guest solver limits also use a signed cookie on your device. Clearing
        site data or using another device can reset guest progress.
      </p>

      <h2>Math questions and photos</h2>
      <p>
        Typed questions are sent to EasyMath so we can generate a solution.
        Uploaded photos are sent so we can read and solve the math in the
        image. EasyMath does not keep a photo library. A signed-in solver
        history item may save the question text and solution, including a note
        that a problem came from a photo.
      </p>

      <h2>AI processing</h2>
      <p>
        Solutions, practice questions, answer checks, and some photo reading are
        generated with an AI model provider (currently OpenAI). The question,
        photo, student level, or answer you submit for that feature may be sent
        to that provider so the feature can run.
      </p>

      <h2>Solver usage</h2>
      <p>
        EasyMath counts daily solver use so the Free plan limit can be applied.
        For guests, this can use a browser cookie and a derived network
        identifier. For signed-in users, usage is tied to the account. Practice
        checks and practice generation are separate from that daily solver
        count.
      </p>

      <h2>Cookies and similar storage</h2>
      <p>The current app may use:</p>
      <ul>
        <li>a guest cookie to apply daily solver limits</li>
        <li>a practice cookie used to protect Show Solution</li>
        <li>authentication cookies if you sign in</li>
        <li>browser localStorage for guest progress, theme, and related settings</li>
      </ul>

      <h2>Service providers</h2>
      <p>
        EasyMath uses cloud hosting, authentication/database services
        (Supabase, when accounts are enabled), and an AI provider to operate
        the product. Those providers process information as needed to provide
        their service.
      </p>

      <h2>Security</h2>
      <p>
        We take ordinary care with accounts and server-side secrets. Signed-in
        progress is loaded for the signed-in user. We do not claim a specific
        encryption standard, audit, or certification on this page.
      </p>

      <h2>Your choices</h2>
      <p>
        You can use EasyMath as a guest, create an account, sign out, or stop
        using the app. There is not currently an in-app button to delete all
        stored account data. You may contact us at{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a> about your
        account.
      </p>

      <h2>Students and younger users</h2>
      <p>
        EasyMath is a general educational math tool and may be used by
        students. This page does not make EasyMath compliant with child-specific
        privacy laws by itself. A parent or guardian should help younger
        students. EasyMath does not ask for extra details such as a student&apos;s
        age, school, or home address.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions:{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
      </p>
    </LegalShell>
  );
}
