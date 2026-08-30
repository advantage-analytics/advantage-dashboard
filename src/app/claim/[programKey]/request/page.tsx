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
import { JoinSharingRows } from "@/components/claim/sharing-rows";
import { advButton } from "@/lib/ui/adv-button";

export const metadata = { title: "Request an invite" };

/**
 * "Request an invite" — the primary action on F3.3 and F3.4.
 *
 * It reaches the owner and queues nothing for the requester: no account is
 * created, no claim is opened, and the program's state does not move. That is
 * the promise F3.3 makes in its own sub-line.
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
  // flow runs before an account exists. No session means no prefill and no
  // note, which is exactly the form this page has always shown.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profileName = "";
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();

    profileName = [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  const eyebrow = [
    program.schoolName,
    teamLabel(program.team),
    programSubtitle(program.division, program.conference),
  ]
    .filter(Boolean)
    .join(" · ");

  // `status`, not `ownerDisplay`, is the signal for whether anyone owns this
  // program — `ownerDisplay` can be empty on a real, claimed program whose
  // owner never filled in a name (`program_public_status()` trims first/last
  // name to '', which coalesces to null same as a genuinely absent owner).
  // Conflating the two would tell a real owner's program "nobody has set this
  // up yet", which is exactly the kind of wrong-but-plausible copy this page
  // exists to avoid.
  const owner = program.ownerDisplay;
  const unclaimed = program.status === "unclaimed";

  return (
    <ClaimShell width={720} gap={20} back={`/claim/${programKey}`}>
      <ClaimHeading
        gap={2}
        eyebrow={eyebrow}
        title={
          owner
            ? `Ask ${owner} for access`
            : unclaimed
              ? "No one runs this yet"
              : "Ask for access"
        }
        titlePadTop={8}
      />
      <p className="text-body max-w-[58ch]">
        {owner
          ? `They manage Advantage for ${program.schoolName} and can add you with the right role.`
          : unclaimed
            ? `Nobody has set up Advantage for ${program.schoolName} yet. Leave your info and whoever does will see it.`
            : `Someone manages Advantage for ${program.schoolName} and can add you with the right role.`}
      </p>
      <ContactOwnerForm
        programKey={programKey}
        kind="request"
        ownerDisplay={owner}
        unclaimed={unclaimed}
        defaultName={profileName}
        nameNote={
          // Whole sentences per branch, not a name slotted into one frame —
          // the unnamed case takes a plural verb, and interpolating "They"
          // into "… sees who's asking" is how that goes wrong quietly.
          profileName
            ? owner
              ? `From your profile. ${owner} sees who's asking, not a bare email.`
              : unclaimed
                ? "From your profile. Whoever sets this program up sees who's asking, not a bare email."
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
          unclaimed
            ? "No account is created for you. Your request is on file for whoever sets this program up."
            : "No account is created for you, and nothing is queued — they add you when they're ready."
        }
      />
    </ClaimShell>
  );
}
