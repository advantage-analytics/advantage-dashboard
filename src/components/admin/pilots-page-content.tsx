"use client";

import { markAdminRowSeen } from "@/app/admin/seen-actions";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  MoreHorizontal,
  Plus,
  UserMinus,
  UserRound,
} from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { AdminPersonCell, TwoLineDate } from "@/components/admin/admin-cells";
import { AddPilotDialog } from "@/components/admin/pilots/add-pilot-dialog";
import { SetHoursDialog } from "@/components/admin/pilots/set-hours-dialog";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import {
  capLabel,
  formatCapHours,
  pilotPlacesLabel,
  pilotUsageState,
  type AdminPilotRow,
  type PilotUsageState,
} from "@/lib/data/admin-pilots-view";
import { formatHoursShort, usageFraction } from "@/lib/data/usage-format";
import { removeIndividualPilot } from "@/lib/services/programs/admin-pilot-actions";
import { PILOT_INDIVIDUAL_MAX_PLAYERS } from "@/lib/services/splitstep/config";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * Admin › Pilots (board Pilots2).
 *
 * One list — Player · This month · Matches · Added — and three writes: Add
 * pilot, Set hours (any account, from the header or a row) and Remove. Rows
 * open nothing: there is no more to a pilot than the row says, so the two
 * row writes sit in a `⋯` menu revealed on hover / focus-within (table law 5)
 * rather than a drawer.
 */

const COL = {
  player: "min-w-0 flex-1",
  month: "w-[240px] shrink-0",
  matches: "w-[64px] shrink-0",
  joined: "w-[92px] shrink-0",
  action: "w-[28px] shrink-0",
} as const;

const ROW = "flex items-center gap-4";

const COLUMNS: readonly { label: string; col: string }[] = [
  { label: "Player", col: COL.player },
  { label: "This month", col: COL.month },
  { label: "Matches", col: COL.matches },
  { label: "Added", col: COL.joined },
];

const MENU_ICON = "size-[13px] shrink-0 text-[var(--ink-400)]";
const DESTRUCTIVE_ROW =
  "group hover:[&>span:last-child>span:first-child]:text-[var(--danger)] focus-visible:[&>span:last-child>span:first-child]:text-[var(--danger)]";
const DESTRUCTIVE_ICON =
  "group-hover:text-[var(--danger)] group-focus-visible:text-[var(--danger)]";

/** Severity → the meter's fill, the same three the Settings meters use. */
const FILL: Record<PilotUsageState, string> = {
  ok: "var(--blue)",
  low: "var(--viz-key)",
  spent: "var(--danger)",
  unlimited: "var(--blue)",
};

type SetHoursTarget = { email: string } | null;

export function PilotsPageContent({
  rows,
}: {
  rows: readonly AdminPilotRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [settingHours, setSettingHours] = useState<SetHoursTarget>(null);
  const [removing, setRemoving] = useState<AdminPilotRow | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removePending, startRemoving] = useTransition();

  const full = rows.length >= PILOT_INDIVIDUAL_MAX_PLAYERS;

  return (
    <AdminPage>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-display">Pilots</h1>
          <p className="text-body-sm mt-[9px] tabular-nums">
            {pilotPlacesLabel(rows.length)} · personal workspace only
          </p>
        </div>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={settingHours !== null}
          className={advButton("outline", "md")}
          onClick={() => setSettingHours({ email: "" })}
        >
          <Clock className="size-3.5" strokeWidth={1.5} aria-hidden />
          Set hours
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={adding}
          className={advButton("primary", "md")}
          disabled={full}
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" strokeWidth={1.5} aria-hidden />
          Add pilot
        </button>
      </div>

      <div className="mt-5 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
        <div className="min-w-[680px] px-6 pt-0.5 pb-1.5">
          <div
            className={cn(
              ROW,
              "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
            )}
          >
            {COLUMNS.map((column) => (
              <span key={column.label} className={cn(column.col, "eyebrow-sm")}>
                {column.label}
              </span>
            ))}
            <span className={COL.action} aria-hidden />
          </div>

          {rows.length === 0 ? (
            <TableEmptyBody
              icon={UserRound}
              title="No pilot individuals yet"
              action={{ label: "Add pilot", onClick: () => setAdding(true) }}
            />
          ) : (
            rows.map((row) => (
              <PilotRow
                key={row.id}
                row={row}
                onSetHours={() => setSettingHours({ email: row.email })}
                onRemove={() => {
                  setRemoveError(null);
                  setRemoving(row);
                }}
              />
            ))
          )}
        </div>
      </div>

      {adding ? <AddPilotDialog onClose={() => setAdding(false)} /> : null}
      {settingHours ? (
        <SetHoursDialog
          initialEmail={settingHours.email}
          onClose={() => setSettingHours(null)}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (next || removePending) return;
          setRemoving(null);
          setRemoveError(null);
        }}
        title={
          removing ? `Remove ${removing.name} from the pilot?` : "Remove pilot?"
        }
        description={
          removing?.overrideHours != null
            ? `They keep the ${formatCapHours(removing.overrideHours * 3600)} h a month an admin set until you clear it with Set hours. Video they already sent this month still counts.`
            : "Their personal workspace goes back to the standard individual allowance from now on. Video they already sent this month still counts."
        }
        confirmLabel="Remove pilot"
        pendingLabel="Removing…"
        tone="danger"
        pending={removePending}
        error={removeError}
        onConfirm={() => {
          const target = removing;
          if (!target) return;
          setRemoveError(null);
          startRemoving(async () => {
            const result = await removeIndividualPilot(target.id);
            if (!result.ok) {
              setRemoveError(result.error);
              return;
            }
            setRemoving(null);
            router.refresh();
          });
        }}
      />
    </AdminPage>
  );
}

function PilotRow({
  row,
  onSetHours,
  onRemove,
}: {
  row: AdminPilotRow;
  onSetHours: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className={cn(
        ROW,
        "group/row -mx-4 h-[52px] rounded-[var(--radius-element)] px-4",
        "transition-colors duration-200 focus-within:bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)]",
      )}
    >
      <span className={COL.player}>
        <AdminPersonCell
          name={row.name}
          photoUrl={row.avatarUrl}
          fresh={row.fresh}
          sub={<span className="truncate">{row.email}</span>}
        />
      </span>

      <span className={COL.month}>
        <MonthCell row={row} />
      </span>

      <span
        className={cn(
          COL.matches,
          "text-[13px] tabular-nums",
          row.matchCount > 0
            ? "text-[var(--ink-700)]"
            : "text-[var(--ink-400)]",
        )}
      >
        {row.matchCount}
      </span>

      <span className={COL.joined}>
        <TwoLineDate at={row.addedAt} fresh={row.fresh} />
      </span>

      <span
        className={cn(
          COL.action,
          "flex justify-end opacity-0 transition-opacity duration-200 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
          menuOpen && "opacity-100",
        )}
      >
        <ChromeTooltip label="Pilot actions" hidden={menuOpen}>
          <span className="inline-flex">
            <FloatMenu
              open={menuOpen}
              onOpenChange={(next) => {
                setMenuOpen(next);
                // Pilot rows have no side panel; opening the row's menu is
                // the open that clears its New dot.
                if (next && row.fresh) {
                  void markAdminRowSeen("pilots", `pilot:${row.id}`);
                }
              }}
              width={232}
              align="end"
              label={`Actions for ${row.name}`}
              trigger={
                <button
                  type="button"
                  aria-label={`Actions for ${row.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  <MoreHorizontal
                    className="size-3.5"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </button>
              }
            >
              <FloatMenuItem
                label="Set hours…"
                description={
                  row.overrideHours != null
                    ? `Now ${capLabel(row.capSeconds)}, set by admin.`
                    : `Now ${capLabel(row.capSeconds)}, the pilot's figure.`
                }
                icon={
                  <Clock className={MENU_ICON} strokeWidth={1.5} aria-hidden />
                }
                onSelect={() => {
                  setMenuOpen(false);
                  onSetHours();
                }}
              />
              <FloatMenuItem
                label="Remove from pilot"
                icon={
                  <UserMinus
                    className={cn(MENU_ICON, DESTRUCTIVE_ICON)}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                }
                className={DESTRUCTIVE_ROW}
                onSelect={() => {
                  setMenuOpen(false);
                  onRemove();
                }}
              />
            </FloatMenu>
          </span>
        </ChromeTooltip>
      </span>
    </div>
  );
}

/**
 * "6.2 of 14 h" over a 3px meter. The word beside the figure carries the
 * severity ("Running low", "Used up") so the colour never speaks alone; an
 * admin-set allowance says so on the figure ("of 14 h · set by admin").
 */
function MonthCell({ row }: { row: AdminPilotRow }) {
  const state = pilotUsageState(row.usedSeconds, row.capSeconds);
  const used = formatHoursShort(row.usedSeconds);
  const figure =
    state === "unlimited"
      ? `${used} h · unlimited`
      : `${used} of ${capLabel(row.capSeconds)}`;
  const word =
    state === "spent" ? "Used up" : state === "low" ? "Running low" : null;
  const loud = word !== null;
  // Credit-paid video is billed beyond the free figure, so it is said apart
  // from it rather than folded into "of 14 h".
  const credits =
    row.creditSeconds > 0
      ? `+${formatHoursShort(row.creditSeconds)} h credits`
      : null;
  return (
    <span className="flex w-full min-w-0 flex-col gap-1.5">
      <span
        className={cn(
          "flex items-baseline justify-between gap-2 text-[12px] whitespace-nowrap tabular-nums",
          loud ? "font-medium text-[var(--ink-900)]" : "text-[var(--ink-700)]",
        )}
      >
        <span className="min-w-0 truncate">
          {figure}
          {row.overrideHours != null ? (
            <span className="font-normal text-[var(--ink-500)]">
              {" "}
              · set by admin
            </span>
          ) : null}
        </span>
        {word || credits ? (
          <span className="shrink-0">
            {word}
            {credits ? (
              <span className="font-normal text-[var(--ink-500)]">
                {word ? " · " : ""}
                {credits}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      {state === "unlimited" ? null : (
        <span
          role="meter"
          aria-label={`${row.name}'s video this month`}
          aria-valuemin={0}
          aria-valuemax={row.capSeconds}
          aria-valuenow={Math.min(row.usedSeconds, row.capSeconds)}
          className="block h-[3px] overflow-hidden rounded-full bg-[var(--ink-100)]"
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${(row.capSeconds <= 0 ? 1 : usageFraction(row.usedSeconds, row.capSeconds)) * 100}%`,
              background: FILL[state],
            }}
          />
        </span>
      )}
    </span>
  );
}
