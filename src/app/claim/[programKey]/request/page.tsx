import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProgramPublicStatus,
  teamLabel,
  programSubtitle,
} from "@/lib/data/programs-server";
import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import { ContactOwnerForm } from "@/components/claim/contact-owner-form";

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
        micro={
          unclaimed
            ? "No account is created for you. Your request is on file for whoever sets this program up."
            : "No account is created for you, and nothing is queued — they add you when they're ready."
        }
      />
    </ClaimShell>
  );
}
