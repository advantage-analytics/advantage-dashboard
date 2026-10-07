import { redirect } from "next/navigation";
import FormHeader from "@/components/auth/form-header";
import AuthButton from "@/components/auth/auth-button";
import AuthFooter from "@/components/auth/auth-footer";
import {
  MISSING_TOKEN_ERROR,
  errorHref,
  parseConfirmLink,
} from "@/lib/auth/confirm-link";
import { confirmLinkForm } from "./actions";

export const metadata = { title: "Finish signing in" };

/**
 * Email link landing page — confirmation, recovery, invite, magic link and
 * email change all point here (see `supabase/email-templates/`).
 *
 * ── Why a page with a button, not a route that signs you in ─────────────────
 * This was a Route Handler that called `verifyOtp` on GET. Emailed links are
 * opened by things that are not people: a school's mail security fetches
 * every link at click time, Safe Links and Cisco Secure Email among them;
 * messaging apps fetch a pasted link to draw a preview; mail clients
 * prefetch. Each of those spent the one-time token, and the person's own
 * tap two seconds later read "That link has expired". On 2026-10-07 a coach
 * lost three sign-in links in a row this way, and the first hit on each was
 * a HEAD request — which Next answers by running GET.
 *
 * So the GET does nothing. It reads the link, renders one button, and carries
 * the token as hidden fields. Only pressing the button — `confirmLinkForm`,
 * a Server Action, POST only — signs anyone in. A fetcher that never presses
 * a button gets a page and leaves the token alone. This is the pattern
 * `/claim/verify-identity` already follows, for the same reason.
 *
 * A plain `<form>` posting to a Server Action, so it works with JavaScript
 * off and inside a mail client's embedded browser. A link with no token is
 * turned away before the page renders, as the handler did.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const link = parseConfirmLink({
    get: (name) => {
      const value = params[name];
      return typeof value === "string" ? value : null;
    },
  });

  if (link.kind === "missing") redirect(errorHref(MISSING_TOKEN_ERROR));

  return (
    <div
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <FormHeader
        eyebrow="Secure link"
        title="Finish Signing In."
        description="Press Continue to finish signing in. Nothing happens until you do."
      />

      <form action={confirmLinkForm} className="flex flex-col gap-[16px]">
        {link.kind === "code" ? (
          <input type="hidden" name="code" value={link.code} />
        ) : (
          <>
            <input type="hidden" name="token_hash" value={link.tokenHash} />
            <input type="hidden" name="type" value={link.type} />
          </>
        )}
        <input type="hidden" name="next" value={link.next} />

        <AuthButton type="submit">Continue</AuthButton>

        <AuthFooter>
          <span className="text-micro">
            Didn&apos;t request this? Close the page. Nothing is signed in
            unless you continue.
          </span>
        </AuthFooter>
      </form>
    </div>
  );
}
