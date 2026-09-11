import type { Metadata } from "next";
import LegalShell from "../legal-shell";
import { getSupportEmail } from "@/lib/support";

export const metadata: Metadata = {
  title: "Terms | EasyMath AI",
  description:
    "Terms for using EasyMath AI, including educational use, AI answers, accounts, and the Free plan.",
};

export default function TermsPage() {
  const supportEmail = getSupportEmail();

  return (
    <LegalShell title="Terms">
      <p>
        These terms are a simple V1 agreement for using EasyMath AI. By using
        the app, you agree to them.
      </p>

      <h2>Educational use</h2>
      <p>
        EasyMath is a learning aid for math problems and practice. It is not a
        school, exam board, or teacher. You are responsible for how you use the
        results, including homework and assessments.
      </p>

      <h2>AI answers can be wrong</h2>
      <p>
        Solutions, hints, practice questions, and photo reading are generated
        with AI. They can contain mistakes. Check important work yourself, or
        with a teacher, before relying on it.
      </p>

      <h2>Acceptable use</h2>
      <p>Please use EasyMath only for lawful educational purposes. Do not:</p>
      <ul>
        <li>try to break, overload, or bypass the service or usage limits</li>
        <li>upload content you do not have the right to use</li>
        <li>use EasyMath to harm others or to cheat in a way your school forbids</li>
      </ul>

      <h2>Accounts</h2>
      <p>
        If you create an account, keep your password private and provide an
        email you can access. You are responsible for activity on that account.
        We may suspend or close an account if these terms are broken or if we
        need to protect the service.
      </p>

      <h2>Free plan</h2>
      <p>
        The current public plan is Free: 10 solver questions per day, including
        photo solves. Practice Mode does not use that daily solver limit. EasyMath
        may show a future Pro option in the app; paid-plan terms are not part of
        this V1 page because a paid checkout is not offered yet.
      </p>

      <h2>Your content</h2>
      <p>
        You are responsible for the questions, answers, and photos you submit.
        Do not upload photos of other people or private documents unless they
        are needed for the math problem and you have the right to use them.
      </p>

      <h2>Availability</h2>
      <p>
        EasyMath may change, break, or pause from time to time. Features can be
        added or removed. We do not promise uninterrupted service.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        EasyMath is provided as-is for educational use. To the extent allowed by
        law, we are not liable for grades, exam results, lost work, or other
        losses that come from using or not being able to use the app, including
        incorrect AI answers.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms:{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
      </p>
    </LegalShell>
  );
}
