"use client";
import { ScheduleToolbarPending } from "./list-toolbar-pending";

import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  canManageTeamSchedule,
  canUploadForProgram,
  isProgramStaff,
} from "@/lib/workspace/types";
import { NewMatchAction } from "@/components/dashboard/team/team-season-title";
import {
  TeamListHeading,
  ScheduleTitleRow,
} from "@/components/dashboard/team/list-page-heading";
import {
  COL,
  ROW,
  ROSTER_COLUMNS,
} from "@/components/dashboard/team/roster-table-layout";
import {
  SCHEDULE_COLUMNS,
  SCHEDULE_GRID,
} from "@/components/dashboard/schedule/static/schedule-table-layout";
import { advButton } from "@/lib/ui/adv-button";
import {
  PendingBar,
  PendingRegion,
  TeamHomeSkeleton,
} from "./team-home-skeleton";

export function TeamHomePageSkeleton() {
  const { active } = useWorkspace();
  return (
    <TeamHomeSkeleton
      action={
        active.kind === "team" ? (
          <NewMatchAction
            canUpload={canUploadForProgram(active)}
            canSubmitVideo={active.canSubmitVideo}
          />
        ) : null
      }
    />
  );
}

export function RosterPageSkeleton() {
  const { active } = useWorkspace();
  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col gap-5 px-14 pt-5 pb-8">
        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end lg:gap-10">
          <TeamListHeading title="Roster">
            <PendingRegion label="roster summary">
              <div className="flex h-[18px] items-center">
                <PendingBar className="w-64" />
              </div>
            </PendingRegion>
          </TeamListHeading>
          {isProgramStaff(active) && (
            <div className="flex shrink-0 items-center gap-2.5">
              <button disabled className={advButton("ghost")}>
                Invite
              </button>
              <button disabled className={advButton("primary")}>
                Add player
              </button>
            </div>
          )}
        </div>
        <div className="surface-card overflow-x-auto">
          <div className="min-w-[768px] px-6 pt-0.5 pb-1.5">
            <div
              className={`${ROW} border-b border-[var(--border-hairline)] pt-3.5 pb-2.5`}
            >
              {ROSTER_COLUMNS.map((column, i) =>
                "spacer" in column ? (
                  <span key={i} className="flex-1" />
                ) : (
                  <span
                    key={column.label}
                    className={`${column.col} eyebrow-sm ${column.center ? "text-center" : ""}`}
                  >
                    {column.label}
                  </span>
                ),
              )}
            </div>
            <PendingRegion label="roster">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className={`${ROW} h-[52px]`}>
                  <div className={COL.spot}>
                    <PendingBar className="mx-auto w-3" />
                  </div>
                  <div className={`${COL.player} flex items-center gap-3`}>
                    <PendingBar className="size-7 shrink-0 rounded-full" />
                    <PendingBar className="w-32" />
                  </div>
                  <span className="flex-1" />
                  <div className={COL.record}>
                    <PendingBar className="w-8" />
                  </div>
                  <div className={COL.form}>
                    <PendingBar className="w-16" />
                  </div>
                  <div className={COL.last}>
                    <PendingBar className="w-40" />
                  </div>
                </div>
              ))}
            </PendingRegion>
          </div>
        </div>
        <PendingBar className="w-72" />
      </div>
    </div>
  );
}

export function SchedulePageSkeleton() {
  const { active } = useWorkspace();
  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px] px-14 pt-5 pb-6">
        <ScheduleTitleRow canCreate={canManageTeamSchedule(active)}>
          <PendingRegion label="schedule summary">
            <div className="flex h-[18px] items-center">
              <PendingBar className="w-72" />
            </div>
          </PendingRegion>
        </ScheduleTitleRow>
        <ScheduleToolbarPending />
        <div className="surface-card min-w-0 px-6 pt-0.5 pb-1.5">
          <div
            className={`grid items-center gap-4 border-b border-[var(--border-hairline)] pt-3.5 pb-2.5 ${SCHEDULE_GRID}`}
          >
            {SCHEDULE_COLUMNS.map((label) => (
              <span key={label} className="eyebrow-sm">
                {label}
              </span>
            ))}
          </div>
          <PendingRegion label="schedule">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className={`grid h-[52px] items-center gap-4 ${SCHEDULE_GRID}`}
              >
                {SCHEDULE_COLUMNS.map((label, j) => (
                  <PendingBar
                    key={label}
                    className={j === 1 ? "w-40" : "w-10"}
                  />
                ))}
              </div>
            ))}
          </PendingRegion>
        </div>
        <PendingBar className="w-64" />
      </div>
    </div>
  );
}
