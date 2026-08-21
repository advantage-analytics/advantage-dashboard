import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProgramPublicStatus,
  claimAge,
  teamLabel,
  programSubtitle,
} from "@/lib/data/programs-server";
import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import { ContactOwnerForm } from "@/components/claim/contact-owner-form";

export const metadata = { title: "This isn't right" };

/**
 * "They no longer work here" (F3.3) and "This isn't right" (F3.4).
 *
 * One route, because it is one question — the person listed should not be the
 * person listed — but the consequence depends on the program's state, and the
 * server action branches on it:
 *
 *   claim_pending  the live claim is objected to and the program returns to
 *                  unclaimed, so somebody else can set it up
 *   active         an ownership dispute is filed; nothing is reversed
 *
 * Nothing is ever reversed automatically in either case. The objector could
 * themselves be the stale record — that is the whole reason a scraped contact
 * list is not an authorization list.
 */
export default async function ObjectPage({
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

  const pending = program.status === "claim_pending";
  const age = claimAge(program.claimedAt);
  const owner = program.ownerDisplay;

  return (
    <ClaimShell width={720} gap={20} back={`/claim/${programKey}`}>
      <ClaimHeading
        gap={2}
        eyebrow={eyebrow}
        title={
          pending ? "Tell us this claim is wrong" : "Tell us who should have this"
        }
        titlePadTop={8}
      />
      <p className="text-body max-w-[58ch]">
        {pending
          ? `Someone set this up${age ? ` ${age} ago` : " recently"}. If that wasn't right, say so and we'll put the program back so the right person can claim it.`
          : owner
            ? `${owner} manages Advantage for ${program.schoolName}. If they've left, tell us and a person will check before anything changes.`
            : "If the person listed has left, tell us and a person will check before anything changes."}
      </p>
      <ContactOwnerForm
        programKey={programKey}
        kind="object"
        boxed
        ownerDisplay={owner}
        micro={
          pending
            ? "Nothing has been analyzed yet, so nothing is lost."
            : "Nothing is reversed automatically. We check first."
        }
      />
    </ClaimShell>
  );
}
