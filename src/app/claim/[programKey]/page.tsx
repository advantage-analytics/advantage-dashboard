import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProgramPublicStatus,
  claimAge,
  teamLabel,
  programSubtitle,
} from "@/lib/data/programs-server";
import {
  ClaimShell,
  AsidePanel,
  CLAIM_BUTTON,
  CLAIM_LINK,
} from "@/components/claim/claim-shell";

/**
 * F3.2 / F3.3 / F3.4 — program status.
 *
 * One route, three states, because they are the same question answered three
 * ways: who owns this program, and what can you do about it. The design calls
 * this "the load-bearing screen" and notes that only the primary action differs
 * per state — so it is one page whose primary action differs per state, not
 * three pages that drift apart.
 *
 * Nobody is ever blocked here. An unclaimed program offers setup, a claimed one
 * redirects you to a person, and one mid-claim tells you how old the claim is
 * so you can decide whether to wait or object.
 */
export default async function ProgramStatusPage({
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

  // ── F3.3 · already claimed ────────────────────────────────────────────────
  // Nobody is blocked; they are redirected to a person. The note field is the
  // page-scale addition: a request that arrives with a name and a reason gets
  // answered, where a bare notification gets ignored.
  if (program.status === "active") {
    const owner = program.ownerDisplay ?? "Someone";
    return (
      <ClaimShell
        eyebrow={eyebrow}
        heading={`${owner} manages Advantage here`}
        sub={`They're listed on the staff for ${program.schoolName}. Ask for access and they can add you with the right role.`}
      >
        <Link href={`/claim/${programKey}/request`} className={CLAIM_BUTTON}>
          Request an invite
        </Link>

        <div className="mt-4 flex flex-col gap-2">
          <Link href={`/claim/${programKey}/object`} className={CLAIM_LINK}>
            They no longer work here
          </Link>
          <p className="text-[12px] leading-[1.6] text-[var(--ink-500)]">
            Notifies {owner}. No account is created for you, and nothing is
            queued.
          </p>
        </div>
      </ClaimShell>
    );
  }

  // ── F3.4 · being set up now ───────────────────────────────────────────────
  // The race condition, stated plainly. The only new fact is the age of the
  // claim, which is why it is the one thing set in mono.
  if (program.status === "claim_pending") {
    const age = claimAge(program.claimedAt);
    return (
      <ClaimShell
        eyebrow={eyebrow}
        heading="Being set up now"
        sub={`Someone from ${program.schoolName} set this up recently. Ask them for access — or tell us if that's wrong.`}
      >
        {age && (
          <p className="mb-5 text-[12px] text-[var(--ink-600)]">
            Claimed <span className="font-mono text-[var(--ink-900)]">{age}</span> ago
          </p>
        )}
        <p className="mb-6 text-[12px] leading-[1.6] text-[var(--ink-500)]">
          Until it&#39;s confirmed, nothing has been sent and no video is being
          analyzed.
        </p>

        <Link href={`/claim/${programKey}/request`} className={CLAIM_BUTTON}>
          Request an invite
        </Link>
        <div className="mt-4">
          <Link href={`/claim/${programKey}/object`} className={CLAIM_LINK}>
            This isn&#39;t right
          </Link>
        </div>
      </ClaimShell>
    );
  }

  // ── F3.2 · unclaimed ──────────────────────────────────────────────────────
  // The aside is what a narrow card had to leave out: ownership is a job, and
  // the page has room to say what the job is before anyone accepts it.
  return (
    <ClaimShell
      eyebrow={eyebrow}
      heading="No one has set this up yet"
      sub={`Whoever sets up ${program.schoolName} ${teamLabel(
        program.team
      ).toLowerCase()} tennis manages access for the rest of the staff and the roster — invites, upload permissions, the monthly budget.`}
      aside={
        <AsidePanel
          title="What you take on"
          items={[
            { text: "Staff and roster access" },
            { text: "Who may send video" },
            { text: "75 hours a month, shared" },
            { text: "Transferable to another coach later" },
          ]}
        />
      }
      footer={
        <>
          Free through December 31, 2026. No hardware to buy, no contract, no
          cost.
        </>
      }
    >
      <Link href={`/claim/${programKey}/setup`} className={CLAIM_BUTTON}>
        Set up this program
      </Link>
      <div className="mt-4">
        <Link href={`/claim/${programKey}/request`} className={CLAIM_LINK}>
          Someone else should own it
        </Link>
      </div>
    </ClaimShell>
  );
}
