import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProgramPublicStatus,
  teamLabel,
  programSubtitle,
} from "@/lib/data/programs-server";
import { ClaimShell } from "@/components/claim/claim-shell";
import { ContactOwnerForm } from "@/components/claim/contact-owner-form";

export const metadata = { title: "Request an invite" };

/**
 * "Request an invite" — the primary action on F3.3 and F3.4.
 *
 * This route did not exist. It was linked four times and returned a 404, so the
 * main thing a coach could do about a program somebody else already had was
 * hit a dead end.
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

  const owner = program.ownerDisplay;

  return (
    <ClaimShell
      eyebrow={eyebrow}
      heading={owner ? `Ask ${owner} for access` : "Ask for access"}
      sub={
        owner
          ? `They manage Advantage for ${program.schoolName} and can add you with the right role.`
          : `Whoever is setting up ${program.schoolName} can add you with the right role.`
      }
      footer="No account is created for you, and nothing is queued — they add you when they're ready."
    >
      <ContactOwnerForm programKey={programKey} kind="request" ownerDisplay={owner} />
    </ClaimShell>
  );
}
