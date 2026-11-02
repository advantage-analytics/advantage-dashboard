import Link from "next/link";
import { Check, Mail } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { teamLabel } from "@/lib/data/programs-server";
import { openWorkspace } from "@/lib/workspace/actions";
import {
  ClaimShell,
  ClaimHeading,
  ClaimActions,
  CLAIM_BUTTON,
  CLAIM_LINK,
  CLAIM_MICRO,
} from "@/components/claim/claim-shell";

export const metadata = { title: "Claim under review" };

/**
 * F5.1 — claim under review.
 *
 * A recognized address never sees this page at all; it lands straight in the
 * program. This exists so the wait has a shape: what works, what doesn't, and
 * no clock. The workspace opens either way — only sending video waits, because
 * that is the one capability that spends the vendor budget and cannot be taken
 * back.
 *
 * No back, only ✕: the claim is submitted, so dismissing this moves forward
 * into the program rather than backwards out of setup.
 *
 * The three capabilities are a checklist in the main column rather than a side
 * panel. Two ticks and one dot say more about the shape of the wait than a
 * paragraph does, and the answer to "what can I do right now" is not off to one
 * side.
 *
 * The wording must not read as a refusal. Matching is exact against a scraped
 * staff list, so real coaches land here every day: UGA's assistant was recorded
 * at `sport.uga.edu` and writes from `sports.uga.edu`, and took "isn't on the
 * recorded staff list" for a rejection on a live demo. So this says what is
 * happening and why it is routine, and names who to ask for video sooner. The
 * review is ours, too: nobody contacts the school.
 */
export default async function ClaimUnderReviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    school?: string;
    team?: string;
    email?: string;
    program?: string;
  }>;
}) {
  const { school, team, email, program } = await searchParams;
  const schoolName = school?.trim() || "your school";
  const eyebrow = [school?.trim(), team ? teamLabel(team) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <ClaimShell
      width={720}
      gap={20}
      exitHref="/dashboard"
      exitLabel="Go to the program"
    >
      <Mail
        className="size-5 text-[var(--ink-700)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />

      <ClaimHeading
        gap={6}
        eyebrow={eyebrow || undefined}
        title="Your program is open while we check your address"
        titlePadTop={4}
        body={`Someone on our team checks any address we can't match to ${schoolName}'s staff page. Those pages go out of date, so this doesn't mean anything is wrong. Everything except sending video works now.`}
        bodyMax="58ch"
      />

      <ul className="flex flex-col py-1">
        {[
          { text: "Invite staff and players", done: true },
          { text: "Build the roster and set permissions", done: true },
          { text: "Sending video — paused until we confirm", done: false },
        ].map((item) => (
          <li
            key={item.text}
            className="flex items-center gap-3 border-t border-[var(--border-hairline)] py-[11px] last:border-b last:border-b-[var(--border-hairline)]"
          >
            {item.done ? (
              <Check
                className="size-3.5 shrink-0 text-[var(--viz-good)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            ) : (
              <span
                className="flex size-3.5 shrink-0 items-center justify-center"
                aria-hidden="true"
              >
                <span className="size-[5px] rounded-full bg-[var(--ink-300)]" />
              </span>
            )}
            {/* DS type classes are unlayered, so they win over a Tailwind
                colour utility — the muted row has to say so inline. */}
            <span
              className="text-body-sm"
              style={item.done ? undefined : { color: "var(--ink-600)" }}
            >
              {item.text}
            </span>
          </li>
        ))}
      </ul>

      <ClaimActions>
        {/* Switches into the program, then lands on its home. A plain
            `/dashboard` link opened in whatever workspace was last active,
            usually Personal. `openWorkspace` checks membership: signed in as
            another account (or after a reset) it still goes to `/dashboard`
            rather than leaving a dead button. The link is
            the fallback for a URL from before `program` was passed. */}
        {program ? (
          <form action={openWorkspace.bind(null, program)}>
            <button type="submit" className={CLAIM_BUTTON}>
              Go to the program
            </button>
          </form>
        ) : (
          <Link href="/dashboard" className={CLAIM_BUTTON}>
            Go to the program
          </Link>
        )}
        <span className={CLAIM_MICRO}>
          {email ? (
            <>
              We&#39;ll email{" "}
              <span className="mono text-[var(--ink-700)]">{email}</span> either
              way.
            </>
          ) : (
            <>We&#39;ll email you either way.</>
          )}{" "}
          Need video sooner? Write to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={CLAIM_LINK}>
            {SUPPORT_EMAIL}
          </a>
          .
        </span>
      </ClaimActions>
    </ClaimShell>
  );
}
