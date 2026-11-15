import { MoreHorizontal } from "lucide-react";

import { AdminBackLink } from "@/components/admin/admin-back-link";
import { AdminDetailsCardSkeleton } from "@/components/admin/admin-details-card";
import { AdminPeopleListSkeleton } from "@/components/admin/admin-people-card";
import { InertButton } from "@/components/admin/inert-button";
import { TeamHoursSkeleton } from "@/components/admin/team-hours";
import { TeamLatestMatchesSkeleton } from "@/components/admin/team-latest-matches";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";

/**
 * `TeamPageHeader` while the page loads: "‹ Teams" and the header's two
 * actions as themselves, then bars for the crest, the name and its pills, the
 * facts line and this month's hours.
 */
function TeamPageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-4">
        <AdminBackLink href="/admin/teams">Teams</AdminBackLink>
        <div className="flex shrink-0 items-center gap-2.5">
          <InertButton>Upload for this team</InertButton>
          <InertButton className="size-8 p-0">
            <MoreHorizontal
              className="size-[15px]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </InertButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-12 gap-y-5">
        <PendingRegion
          label="the team"
          className="min-w-0"
          innerClassName="flex min-w-0 items-center gap-4"
        >
          <PendingBar className="size-16 shrink-0 rounded-[var(--radius-dropdown)]" />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex h-9 items-center gap-2.5">
              <PendingBar className="h-6 w-72" />
              <PendingBar className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex h-[18px] items-center gap-[18px]">
              <PendingBar className="h-3 w-28" />
              <PendingBar className="h-3 w-24" />
              <PendingBar className="h-3 w-20" />
            </div>
          </div>
        </PendingRegion>
        <TeamHoursSkeleton />
      </div>
    </div>
  );
}

/**
 * Admin › Teams › one program while the page loads
 * (`teams/[programId]/loading.tsx`): the default view's blocks — the header,
 * Details, People, Latest matches — in the page's order.
 *
 * No `AdminPage` and no column: `[programId]/layout.tsx` already draws both
 * around this, and the route's `loading.tsx` renders inside that layout. The
 * activity log is not drawn: it sits under the fold and its length is the
 * data.
 */
export function TeamPageSkeleton() {
  return (
    <>
      <TeamPageHeaderSkeleton />
      <section aria-label="Details" className="flex flex-col gap-4">
        <AdminDetailsCardSkeleton />
      </section>
      <AdminPeopleListSkeleton />
      <TeamLatestMatchesSkeleton />
    </>
  );
}
