import Link from "next/link";
import {
  ClaimShell,
  ClaimHeading,
  ClaimActions,
  CLAIM_MICRO,
} from "@/components/claim/claim-shell";
import { ReferralLink } from "@/components/claim/referral-link";
import { advButton } from "@/lib/ui/adv-button";
import { siteUrl } from "@/lib/site-url";

export const metadata = { title: "Not on Advantage yet" };

/** Longer than any real school name; a URL parameter is not a length promise. */
const MAX_SCHOOL = 60;

/**
 * The school the player was looking for, as something safe to put in a heading.
 *
 * React escapes the value either way, so this is not about injection — it is
 * about a 4,000-character query parameter turning the title into the page.
 * Whitespace is collapsed because a search term arrives however it was typed.
 */
function cleanSchool(raw: string | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SCHOOL);
}

/**
 * "northgate" — the campaign tag on the link the player pastes to their coach.
 *
 * A slug, deliberately, and NOT a program key: there is no program to key to,
 * which is the entire premise of this screen. Nothing looks it up, and `/claim`
 * ignores it. It exists so that a claim arriving from a player's nudge can be
 * told apart from one that arrived cold.
 */
function slugify(school: string): string {
  return school
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 4.3 — the program isn't here yet.
 *
 * The anti-dead-end, and the one screen in the player's branch with no form on
 * it. That is the design's point: a player cannot verify their own program, so
 * collecting their details would only file a request nobody is able to action —
 * a waitlist that feels like progress and is not. The single useful artifact is
 * a link they can paste to a coach, so the link is the whole screen.
 *
 * The coach's equivalent, `/claim/program/new`, still takes a form, because a
 * coach CAN vouch for a program and that request has somebody to go to.
 */
export default async function ProgramReferralPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string }>;
}) {
  const { school: raw } = await searchParams;
  const school = cleanSchool(raw);
  const slug = slugify(school);

  // No school in the URL is a reachable state — somebody can open this screen
  // without having typed anything — so the link degrades to the bare claim
  // entry rather than carrying an empty `ref=`.
  const url = `${siteUrl()}/claim${slug ? `?ref=${slug}` : ""}`;

  return (
    <ClaimShell width={720} gap={20} back="/claim/program?intent=join">
      <ClaimHeading
        gap={6}
        title={
          school
            ? `${school} isn't on Advantage yet`
            : "That program isn't on Advantage yet"
        }
        body="Team workspaces are free for collegiate programs during the pilot, and a coach has to set one up. Send them this and keep going on your own account."
        bodyMax="56ch"
      />

      <ReferralLink url={url} />

      <ClaimActions>
        <Link href="/dashboard" className={advButton("primary")}>
          Continue to my account
        </Link>
        {/* The design's line here is "We'll tell you if <school> joins", which
            this cannot keep: nothing is filed by this screen, so there is no
            record from which anyone could be told. Saying what does happen is
            the same reassurance without the debt — and it matches how the rest
            of the flow talks about what it has and has not queued. */}
        <span className={CLAIM_MICRO}>
          Nothing is filed for you — the link is the whole ask.
        </span>
      </ClaimActions>
    </ClaimShell>
  );
}
