import { MoreHorizontal } from "lucide-react";

import { AdminBackLink } from "@/components/admin/admin-back-link";
import { AdminPage } from "@/components/admin/admin-page";
import { ConferenceDetailsSkeleton } from "@/components/admin/conference-details";
import { ConferenceTeamsSectionSkeleton } from "@/components/admin/conference-teams-section";
import { InertButton } from "@/components/admin/inert-button";
import { TeamLatestMatchesSkeleton } from "@/components/admin/team-latest-matches";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";

/**
 * Admin › Conferences › one conference while the page loads
 * (`conferences/[conferenceId]/loading.tsx`): the page's column and its four
 * blocks in order — the header ("‹ Conferences" and the ⋯ menu as themselves,
 * bars for the mark, the name and the meta line), Details, Teams and Latest
 * matches.
 */
export function ConferencePageSkeleton() {
  return (
    <AdminPage>
      <div className="flex w-full flex-col gap-10">
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-4">
            <AdminBackLink href="/admin/conferences">Conferences</AdminBackLink>
            <InertButton className="size-8 p-0">
              <MoreHorizontal
                className="size-[15px]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </InertButton>
          </div>
          <PendingRegion
            label="the conference"
            innerClassName="flex min-w-0 items-center gap-4"
          >
            <PendingBar className="size-10 shrink-0 rounded-[var(--radius-element)]" />
            <div className="flex min-w-0 flex-col gap-2">
              <span className="flex h-9 items-center">
                <PendingBar className="h-6 w-80" />
              </span>
              <span className="flex h-[18px] items-center">
                <PendingBar className="h-3 w-48" />
              </span>
            </div>
          </PendingRegion>
        </div>

        <section aria-label="Details" className="flex flex-col gap-4">
          <ConferenceDetailsSkeleton />
        </section>

        <section aria-label="Teams">
          <ConferenceTeamsSectionSkeleton />
        </section>

        <TeamLatestMatchesSkeleton scope="conference" />
      </div>
    </AdminPage>
  );
}
