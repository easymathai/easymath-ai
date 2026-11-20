import type { Metadata } from "next";
import LegalShell from "../legal-shell";
import { getSupportEmail } from "@/lib/support";

export const metadata: Metadata = {
  title: "Delete account | EasyMath Ai",
  description:
    "How to delete your EasyMath Ai account and the cloud progress saved to it.",
};

export default function DeleteAccountPage() {
  const supportEmail = getSupportEmail();
  const mailHref = `mailto:${supportEmail}?subject=${encodeURIComponent("EasyMath account deletion request")}&body=${encodeURIComponent(
    "Please delete my EasyMath Ai account and the cloud progress saved to it.\n\nAccount email:\n\nAny other detail that will help us find the account:\n"
  )}`;

  return (
    <LegalShell title="Delete account" updated="21 November 2026">
      <p>
        You can delete your EasyMath Ai account and the cloud progress saved to
        it. This is permanent. It does not remove copies that may already be
        sitting in short-lived server logs or backups, and it does not delete
        progress that was only saved in a browser as a guest.
      </p>

      <h2>Delete it yourself while signed in</h2>
      <p>
        If you can sign in, this is the fastest path:
      </p>
      <ul>
        <li>
          On the website, open Account and choose Delete account. You will be
          asked to type DELETE to confirm.
        </li>
        <li>
          In the EasyMath Ai Android app, open Account and choose Delete
          account, then type DELETE to confirm.
        </li>
      </ul>
      <p>
        After you confirm, EasyMath permanently deletes your authentication
        account and the cloud progress tied to it, including your profile,
        practice progress, solver history, activity, mistakes saved for review,
        and signed-in daily usage.
      </p>

      <h2>Request deletion by email</h2>
      <p>
        If you cannot sign in, or you would rather not use the in-app flow,
        email{" "}
        <a href={mailHref}>{supportEmail}</a> from the same address as your
        EasyMath account. Include the account email and ask us to delete the
        account. You can use this request link to start the message:
      </p>
      <p>
        <a href={mailHref}>Email an account deletion request</a>
      </p>
      <p>
        We use the request to identify your account and complete the same
        deletion. Please allow a few days if you write by email.
      </p>

      <h2>What is not removed by an account delete</h2>
      <ul>
        <li>
          Guest progress and settings stored only in a browser (localStorage and
          the guest solver cookie) stay on that device until you clear site
          data.
        </li>
        <li>
          Questions or photos already sent to the AI provider so a solution
          could be generated are handled under that provider&apos;s policies.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Account questions:{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
      </p>
    </LegalShell>
  );
}
