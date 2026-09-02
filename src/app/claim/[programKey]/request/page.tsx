import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProgramPublicStatus,
  teamLabel,
  programSubtitle,
} from "@/lib/data/programs-server";
import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import { ContactOwnerForm } from "@/components/claim/contact-owner-form";
import { ReferralRequestForm } from "@/components/claim/referral-request-form";
import { JoinSharingRows } from "@/components/claim/sharing-rows";
import { advButton } from "@/lib/ui/adv-button";
import { siteUrl } from "@/lib/site-url";

export const metadata = { title: "Request an invite" };

/**
 * "Request an invite" — the primary action on F3.3 and F3.4, and where F3.2's
 * "Someone else should own it" lands.
 *
 * It reaches the owner and queues nothing for the requester: no account is
 * created, no claim is opened, and the program's state does not move. That is
 * the promise F3.3 makes in its own sub-line.
 *
 * ── Unclaimed: the referral screen (4.3b a) ─────────────────────────────────
 * Nobody is reading requests on an unclaimed program yet, which changes what
 * the screen is for. The request still files — attached to the program row,
 * and whoever sets the program up sees it on day one in the roster's join
 * requests — but the only thing that can make a workspace exist is the person
 * this visitor has in mind, so the screen leads with a link to send them.
 *
 * One screen for everyone who arrives, player or staff: who they are comes
 * from the persona onboarding stored, never from a marker on the URL they
 * came by. A forwarded link lands on a signed-out stranger who passes through
 * onboarding first, and a role in a query string is both spoofable and a
 * second answer to a question the role select already asks.
 */
export default async function RequestInvitePage({
  params,
}: {
  params: Promise<{ programKey: string }>;
}) {
  const { programKey } = await params;
  const supabase = await createClient();
  const program = await getProgramPublicStatus(supabase, programKey);

  if (!program) notFound();

  // Design 4.2's one added field, and the reason it is added: the request
  // should arrive as "Rafael Osei wants to join" rather than as an address a
  // coach has to decode. Read here rather than in the form because a client
  // component cannot see the session, and because `users` is RLS-scoped to the
  // reader — this returns the visitor's own row or nothing at all.
  //
  // Signed-out is an ordinary case on this screen, not a failure: the whole
  // flow runs before an account exists. No session means no prefill, no
  // account address, and the email field the form has always had.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profileName = "";
  let persona: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("first_name, last_name, role")
      .eq("id", user.id)
      .maybeSingle();

    profileName = [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    persona = profile?.role ?? null;
  }

  // `getUser()` verifies the session against the auth server, so this is the
  // one address the visitor has proven they control — the same test the
  // action applies before it sends a receipt.
  const accountEmail = user?.email?.trim() || undefined;

  // `status`, not `ownerDisplay`, is the signal for whether anyone owns this
  // program — `ownerDisplay` can be empty on a real, claimed program whose
  // owner never filled in a name (`program_public_status()` trims first/last
  // name to '', which coalesces to null same as a genuinely absent owner).
  // Conflating the two would tell a real owner's program "nobody has set this
  // up yet", which is exactly the kind of wrong-but-plausible copy this page
  // exists to avoid.
  const owner = program.ownerDisplay;
  const qualifiers = [
    teamLabel(program.team),
    programSubtitle(program.division, program.conference),
  ]
    .filter(Boolean)
    .join(" · ");

  if (program.status === "unclaimed") {
    return (
      <ClaimShell width={720} gap={20} back={`/claim/${programKey}`}>
        {/* The title owns the school name, so the eyebrow carries only the
            qualifiers and stops wrapping on long institutions. */}
        <ClaimHeading
          gap={2}
          eyebrow={qualifiers}
          title={`${program.schoolName} isn't on Advantage yet`}
          titlePadTop={8}
          body="Team workspaces are free for collegiate programs through the 2026 pilot, and a coach has to set one up. Send them the link — and leave your name so they can add you the day it goes live."
          bodyMax="58ch"
        />
        <ReferralRequestForm
          programKey={programKey}
          schoolName={program.schoolName}
          // The program's own status page — one click from "Set up this
          // program" for whoever receives it. A program key, not 4.3's
          // campaign slug: this program exists.
          referralUrl={`${siteUrl()}/claim/${encodeURIComponent(programKey)}`}
          defaultName={profileName}
          // The persona picks the role, where it maps onto one. A coach who is
          // here is by definition not the owner, so "coach" chooses nothing.
          defaultRole={persona === "player" ? "player" : ""}
          accountEmail={accountEmail}
        />
      </ClaimShell>
    );
  }

  const eyebrow = [program.schoolName, qualifiers].filter(Boolean).join(" · ");

  return (
    <ClaimShell width={720} gap={20} back={`/claim/${programKey}`}>
      <ClaimHeading
        gap={2}
        eyebrow={eyebrow}
        title={owner ? `Ask ${owner} for access` : "Ask for access"}
        titlePadTop={8}
      />
      <p className="text-body max-w-[58ch]">
        {owner
          ? `They manage Advantage for ${program.schoolName} and can add you with the right role.`
          : `Someone manages Advantage for ${program.schoolName} and can add you with the right role.`}
      </p>
      <ContactOwnerForm
        programKey={programKey}
        kind="request"
        ownerDisplay={owner}
        defaultName={profileName}
        accountEmail={accountEmail}
        nameNote={
          // Whole sentences per branch, not a name slotted into one frame —
          // the unnamed case takes a plural verb, and interpolating "They"
          // into "… sees who's asking" is how that goes wrong quietly.
          profileName
            ? owner
              ? `From your profile. ${owner} sees who's asking, not a bare email.`
              : "From your profile. They see who's asking, not a bare email."
            : undefined
        }
        terms={<JoinSharingRows />}
        secondary={
          // The way out that is not a dead end. A player who decides not to ask
          // still has an account and their own matches — "Keep it personal" is
          // a real second option here, not a cancel, so it is the design's
          // ghost button beside the primary rather than a quiet link.
          <Link href="/dashboard" className={advButton("ghost")}>
            Keep it personal
          </Link>
        }
        micro={
          // Where the reply lands is stated here rather than asked above: with
          // a session the address is known, and the line beside the button is
          // where this screen already says what sending does.
          `No account is created for you, and nothing is queued — they add you when they're ready${accountEmail ? `, at ${accountEmail}` : ""}.`
        }
      />
    </ClaimShell>
  );
}
