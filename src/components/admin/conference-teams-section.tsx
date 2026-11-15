"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AddTeamPopover } from "@/components/admin/add-team-popover";
import {
  ApprovePilotPopover,
  type ApprovePilotTarget,
} from "@/components/admin/approve-pilot-popover";
import { TeamsTable, TeamsTableSkeleton } from "@/components/admin/teams-table";
import type { AdminConferenceRow } from "@/lib/data/admin-conferences-view";
import type { AdminTeamRow } from "@/lib/data/admin-teams-server";

/**
 * The Admin › Conferences detail page's Teams section: a heading with "Add a
 * team" beside it, then every team in the conference as the Teams list's own
 * `TeamsTable` — the same rows, tracks and record-row navigation, never a
 * second table.
 *
 * "Add a team" is the Conference drawer's `AddTeamPopover`, which calls
 * `addTeamToConference` itself; a successful add refreshes the server page so
 * the new row (and Details' team count) arrives with the next render.
 *
 * A row waiting on a pilot decision draws `TeamsTable`'s Approve chip, and it
 * opens the same `ApprovePilotPopover` the Teams list does, anchored the same
 * way: the chip's rect is caught in the capture phase of its own click,
 * before `TeamsTable` hands over the row.
 *
 * A client component: the table's `onApprove` and the popover's `onAdded`
 * are event handlers a Server Component page cannot pass.
 */
export function ConferenceTeamsSection({
  conference,
  teams,
}: {
  conference: AdminConferenceRow;
  teams: readonly AdminTeamRow[];
}) {
  const router = useRouter();

  const chipRect = useRef<DOMRect | null>(null);
  const captureChip = (event: React.MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement | null)?.closest("button");
    chipRect.current = button?.getBoundingClientRect() ?? null;
  };

  const [approving, setApproving] = useState<ApprovePilotTarget | null>(null);
  const openApprove = (row: AdminTeamRow) => {
    const claimId = row.pendingClaim?.id;
    const rect = chipRect.current;
    // A row whose plan is `approve` always carries `pendingClaim`.
    if (!claimId || !rect) return;
    setApproving({
      claimId,
      teamName: row.name,
      anchorRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[14px] font-medium text-[var(--ink-900)]">Teams</h2>
        <AddTeamPopover
          conference={conference}
          onAdded={() => router.refresh()}
        />
      </div>

      <div onClickCapture={captureChip}>
        <TeamsTable
          rows={teams}
          emptyTitle="No teams in this conference yet"
          onApprove={openApprove}
        />
      </div>

      <ApprovePilotPopover
        target={approving}
        onClose={() => setApproving(null)}
        onDecided={() => router.refresh()}
      />
    </div>
  );
}

/**
 * The Teams section while the conference page loads: the real heading, "Add
 * a team" as an inert word (its popover needs the conference), and the Teams
 * table's own skeleton.
 */
export function ConferenceTeamsSectionSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[14px] font-medium text-[var(--ink-900)]">Teams</h2>
        <span
          aria-hidden="true"
          className="text-[12px] font-medium whitespace-nowrap text-[var(--blue)]"
        >
          Add a team
        </span>
      </div>
      <TeamsTableSkeleton rows={4} />
    </div>
  );
}
