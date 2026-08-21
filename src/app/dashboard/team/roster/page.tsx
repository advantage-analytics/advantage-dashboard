import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getRosterData } from "@/lib/data/team-roster-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { formatResetDate } from "@/lib/data/usage-format";
import { RosterTable } from "@/components/dashboard/team/roster-table";
import { InviteButtons } from "@/components/dashboard/team/invite-buttons";

export const metadata = { title: "Roster" };

/**
 * Everyone on the program, and how much of its budget each has spent.
 *
 * Replaces a `ComingSoonPage` that had been one of the coach's three rail items
 * since the team navigation shipped. It was a placeholder for a real reason —
 * before invitations worked there was nobody to list but the person who claimed
 * the program, and a roster of one is a page that only says "you are here".
 *
 * The invite control sits on this page rather than only in Settings › Team
 * because this is where a coach notices someone is missing.
 */
export default async function RosterPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active, viewer } = workspace;
  // The rail only offers this destination inside a program. Somebody who typed
  // the URL from a personal workspace gets their own dashboard rather than an
  // empty roster belonging to nobody.
  if (active.kind !== "team") redirect("/dashboard");

  const billingMonth = currentBillingMonth();
  const roster = await getRosterData(active.id, billingMonth);

  // A hidden control is not authorization — every write behind these re-checks
  // `is_program_staff` in SQL. This only decides what is worth rendering.
  const canManage = active.role !== "player";

  const playerCount = roster.members.filter((m) => m.role === "player").length;
  const staffCount = roster.members.length - playerCount;

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-6 py-8 sm:px-10 sm:py-8">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:gap-10">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[24px] font-light leading-[1.2] tracking-[-0.4px] text-[var(--ink-900)]">
              {canManage ? "Roster" : "Your place on the roster"}
            </h1>
            <p className="max-w-[56ch] text-[13px] leading-[1.6] text-[var(--ink-700)]">
              {canManage ? (
                <>
                  {staffCount} on staff and {playerCount}{" "}
                  {playerCount === 1 ? "player" : "players"}. Anyone marked
                  &ldquo;can send&rdquo; may spend the program&apos;s analysis
                  time, which resets {formatResetDate(roster.billingMonth)}.
                </>
              ) : (
                <>
                  Your coaching staff manage who is on the program and who can
                  send video. Analysis time resets{" "}
                  {formatResetDate(roster.billingMonth)}.
                </>
              )}
            </p>
          </div>

          {canManage && (
            <InviteButtons playersCanUpload={roster.playersCanUpload} />
          )}
        </div>

        <RosterTable
          members={roster.members}
          invites={roster.invites}
          canManage={canManage}
          viewerId={viewer.id}
        />
      </div>
    </div>
  );
}
