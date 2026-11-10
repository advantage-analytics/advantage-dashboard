"use client";
import { ScheduleToolbarPending } from "./list-toolbar-pending";

import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { PresenceGate } from "@/components/dashboard/presence-provider";
import { RosterDayZeroPage } from "@/components/dashboard/team/roster-day-zero";
import { RosterHeaderButtonsPending } from "@/components/dashboard/team/roster-header-buttons";
import {
  DEFAULT_ROSTER_SHAPE,
  useRecalledRosterShape,
} from "@/components/dashboard/team/roster-shape-memory";
import { GripVertical } from "lucide-react";
import { ScheduleDayZeroPage } from "@/components/dashboard/schedule/static/schedule-day-zero";
import { TeamHomeDayZeroPage } from "@/components/dashboard/team/team-home-day-zero-page";
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
  ROSTER_MIN_WIDTH,
} from "@/components/dashboard/team/roster-table-layout";
import {
  SCHEDULE_COLUMNS,
  SCHEDULE_GRID,
} from "@/components/dashboard/schedule/static/schedule-table-layout";
import {
  PendingBar,
  PendingRegion,
  TeamHomeSkeleton,
} from "./team-home-skeleton";

export function TeamHomePageSkeleton() {
  const { active } = useWorkspace();
  // Nothing to load: draw the onboarding page this resolves to.
  return (
    <PresenceGate
      surface="teamHome"
      dayZero={
        active.kind === "team" ? (
          <TeamHomeDayZeroPage
            canManage={isProgramStaff(active)}
            canUpload={canUploadForProgram(active)}
            teamName={active.name}
          />
        ) : null
      }
      skeleton={
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
      }
    />
  );
}

export function RosterPageSkeleton() {
  const { active } = useWorkspace();
  // Nothing to load into rows: draw the page this resolves to, not a table.
  return (
    <PresenceGate
      surface="roster"
      dayZero={
        <RosterDayZeroPage canManage={isProgramStaff(active)} buttons={null} />
      }
      skeleton={<RosterRowsSkeleton />}
    />
  );
}

/**
 * The populated Roster page with the data blanked — `RosterView`'s frame, the
 * real title and buttons, and `RosterTable`'s card at the shape this workspace
 * last rendered (`roster-shape-memory`): its lineup rows, the "Not in the
 * lineup" divider and bench, the Invited section and the footer's two lines.
 * The Matches skeleton's rule, so nothing moves when the rows land.
 */
function RosterRowsSkeleton() {
  const { active } = useWorkspace();
  const canManage = isProgramStaff(active);
  const shape = useRecalledRosterShape(active.id) ?? DEFAULT_ROSTER_SHAPE;
  const players = shape.ranked + shape.benched;
  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col gap-5 px-8 pt-5 pb-8 xl:px-14">
        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end lg:gap-10">
          <TeamListHeading title="Roster">
            <PendingRegion label="roster summary">
              <div className="flex h-[18px] items-center">
                <PendingBar className={canManage ? "w-64" : "w-96"} />
              </div>
            </PendingRegion>
          </TeamListHeading>
          {canManage && <RosterHeaderButtonsPending />}
        </div>
        <div className="surface-card overflow-x-auto">
          <div className={`${ROSTER_MIN_WIDTH} px-6 pt-0.5 pb-1.5`}>
            <div
              className={`${ROW} border-b border-[var(--border-hairline)] pt-3.5 pb-2.5`}
            >
              {ROSTER_COLUMNS.map((column) => (
                <span
                  key={column.label}
                  className={`${column.col} eyebrow-sm ${column.center ? "text-center" : ""} ${column.label === "Last Match" ? "flex items-center" : ""}`}
                >
                  {column.label}
                  {/* Real chrome, drawn inert: the page shows it to staff
                      whenever there is more than one player to order. */}
                  {column.label === "Last Match" &&
                    canManage &&
                    players > 1 && (
                      <span
                        aria-hidden="true"
                        className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-sans text-[11px] font-medium tracking-normal text-[var(--blue)] normal-case"
                      >
                        <GripVertical
                          className="size-3"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        Set lineup
                      </span>
                    )}
                </span>
              ))}
            </div>
            <PendingRegion label="roster">
              {Array.from({ length: shape.ranked }, (_, i) => (
                <PlayerRowPending key={`ranked-${i}`} spot />
              ))}
              {shape.benched > 0 && (
                <div className="flex items-center gap-1.5 pt-4 pb-2">
                  <span className="eyebrow-sm">Not in the lineup</span>
                </div>
              )}
              {Array.from({ length: shape.benched }, (_, i) => (
                <PlayerRowPending key={`bench-${i}`} spot={false} />
              ))}
              {shape.invites > 0 && (
                <div className="flex items-center gap-2.5 border-t border-[var(--border-hairline)] pt-3.5 pb-1.5">
                  <span className="eyebrow-sm">Invited</span>
                </div>
              )}
              {Array.from({ length: shape.invites }, (_, i) => (
                <div key={`invite-${i}`} className={`${ROW} h-[52px]`}>
                  <div className={COL.spot} />
                  <div className={`${COL.player} flex items-center gap-2.5`}>
                    <PendingBar className="size-[26px] shrink-0 rounded-full" />
                    <PendingBar className="w-40" />
                  </div>
                  <PendingBar className="ml-4 w-36" />
                </div>
              ))}
            </PendingRegion>
          </div>
        </div>
        {/* The footer's sentences at their 11px · 1.6 line boxes: "Coached by"
            when the program has staff, then the upload-policy line. */}
        <div className="flex flex-col gap-2">
          {shape.staffLine && (
            <div className="flex h-[17.6px] items-center">
              <PendingBar className="h-2.5 w-56" />
            </div>
          )}
          <div className="flex h-[17.6px] items-center">
            <PendingBar className="h-2.5 w-80" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** One player row: line number (or none on the bench), mark and name, then the stats. */
function PlayerRowPending({ spot }: { spot: boolean }) {
  return (
    <div className={`${ROW} h-[52px]`}>
      <div className={COL.spot}>
        {spot && <PendingBar className="mx-auto w-3" />}
      </div>
      <div className={`${COL.player} flex items-center gap-2.5`}>
        <PendingBar className="size-[26px] shrink-0 rounded-full" />
        <PendingBar className="w-32" />
      </div>
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
  );
}

export function SchedulePageSkeleton() {
  const { active } = useWorkspace();
  // Nothing to load into rows: draw the page this resolves to, not a table.
  return (
    <PresenceGate
      surface="schedule"
      dayZero={
        <ScheduleDayZeroPage
          canCreate={canManageTeamSchedule(active)}
          canAddOwnMatch={canUploadForProgram(active)}
        />
      }
      skeleton={<ScheduleRowsSkeleton />}
    />
  );
}

function ScheduleRowsSkeleton() {
  const { active } = useWorkspace();
  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px] px-8 pt-5 pb-6 xl:px-14">
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
