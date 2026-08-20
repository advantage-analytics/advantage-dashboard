import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getProgramPublicStatus,
  claimAge,
  teamLabel,
  programSubtitle,
} from "@/lib/data/programs-server";
import {
  ClaimShell,
  ClaimHeading,
  AsidePanel,
  ClaimActions,
  CLAIM_BUTTON,
  CLAIM_LINK,
  CLAIM_MICRO,
} from "@/components/claim/claim-shell";
import { ContactOwnerForm } from "@/components/claim/contact-owner-form";

export const metadata = { title: "Program status" };

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
  // Nobody is blocked; they are redirected to a person. The note field is on
  // this page rather than behind the button: a request that arrives with a name
  // and a reason gets answered, where a bare notification gets ignored.
  if (program.status === "active") {
    const owner = program.ownerDisplay ?? "Someone";
    return (
      <ClaimShell width={720} gap={20} back="/claim/program">
        <ClaimHeading
          gap={2}
          eyebrow={eyebrow}
          title={`${owner} manages Advantage here`}
          titlePadTop={8}
        />
        {/* The design says "She's listed as head coach". A directory row is a
            name and a title, never a pronoun — so the sentence is written the
            one way that cannot be wrong about a real person. */}
        <p className="text-body max-w-[58ch]">
          They&#39;re listed on the staff for {program.schoolName}. Ask for
          access and they can add you with the right role.
        </p>
        <ContactOwnerForm
          programKey={programKey}
          kind="request"
          boxed
          ownerDisplay={program.ownerDisplay}
          secondary={
            <Link href={`/claim/${programKey}/object`} className={CLAIM_LINK}>
              They no longer work here
            </Link>
          }
          micro={`Notifies ${owner}. No account is created for you, and nothing is queued.`}
        />
      </ClaimShell>
    );
  }

  // ── F3.4 · being set up now ───────────────────────────────────────────────
  // The race condition, stated plainly. The only new fact is the age of the
  // claim, which is why it is the one thing set in mono — someone deciding
  // whether to wait or object needs to know if this happened six hours ago or
  // six weeks ago.
  if (program.status === "claim_pending") {
    const age = claimAge(program.claimedAt);
    return (
      <ClaimShell width={720} gap={20} back="/claim/program">
        <ClaimHeading
          gap={2}
          eyebrow={eyebrow}
          title="Being set up now"
          titlePadTop={8}
        />
        <p className="text-body max-w-[58ch]">
          Someone from {program.schoolName} set this up recently. Ask them for
          access — or tell us if that&#39;s wrong.
        </p>

        <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px] py-3.5">
          <Clock
            className="size-5 shrink-0 text-[var(--ink-700)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            {age && (
              <span className="text-body-sm" style={{ color: "var(--ink-900)" }}>
                Claimed <span className="mono tabular">{age}</span> ago
              </span>
            )}
            <span className={CLAIM_MICRO}>
              Until it&#39;s confirmed, nothing has been sent and no video is
              being analyzed.
            </span>
          </div>
        </div>

        <ClaimActions>
          <Link href={`/claim/${programKey}/request`} className={CLAIM_BUTTON}>
            Request an invite
          </Link>
          <Link href={`/claim/${programKey}/object`} className={CLAIM_LINK}>
            This isn&#39;t right
          </Link>
        </ClaimActions>
      </ClaimShell>
    );
  }

  // ── F3.2 · unclaimed ──────────────────────────────────────────────────────
  // The aside is what a narrow card had to leave out: ownership is a job, and
  // the page has room to say what the job is before anyone accepts it.
  return (
    <ClaimShell
      width={840}
      gap={16}
      back="/claim/program"
      aside={
        <AsidePanel
          title="What you take on"
          items={[
            "Staff and roster access",
            "Who may send video",
            "75 hours a month, shared",
            "Transferable to another coach later",
          ]}
        />
      }
    >
      <ClaimHeading
        gap={2}
        eyebrow={eyebrow}
        title="No one has set this up yet"
        titlePadTop={8}
      />
      <p className="text-body max-w-[56ch]">
        Whoever sets up {program.schoolName}{" "}
        {teamLabel(program.team).toLowerCase()} tennis manages access for the
        rest of the staff and the roster — invites, upload permissions, the
        monthly budget.
      </p>
      <div className="pt-1">
        <ClaimActions>
          <Link href={`/claim/${programKey}/setup`} className={CLAIM_BUTTON}>
            Set up this program
          </Link>
          <Link href={`/claim/${programKey}/request`} className={CLAIM_LINK}>
            Someone else should own it
          </Link>
        </ClaimActions>
      </div>
      <span className={CLAIM_MICRO}>
        Free through December 31, 2026. No hardware to buy, no contract, no
        cost.
      </span>
    </ClaimShell>
  );
}
