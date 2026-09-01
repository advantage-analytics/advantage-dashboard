"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleCheck, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import { DualWidget } from "@/components/dashboard/schedule/static/dual-widget";
import { EventDrawer } from "@/components/dashboard/schedule/static/event-drawer";
import { formatEventDay, siteTitle } from "@/lib/schedule/format";
import {
  SEASON_FACTS,
  type StaticSchedule as StaticScheduleData,
} from "@/lib/schedule/fixtures";
import type { ScheduleRow } from "@/lib/schedule/types";

/**
 * `7e`, `7d`, `7c` and `4c` — the schedule's drawer-plus-pane frame, rendered
 * from fixtures.
 *
 * Two branches over one `StaticSchedule`:
 *
 *   `POPULATED_SCHEDULE` → `7d`, the landing state: four events in the drawer
 *                          and a pane that prompts, carrying the two facts
 *                          that hold without a selection.
 *   `EMPTY_SCHEDULE`     → `7e`, day zero: "None yet" in both drawer sections
 *                          and the empty state over the nine-line scaffold.
 *
 * Two fixture sets rather than one behind a flag, because `7e` is not `7d`
 * with the rows removed — its pane is different copy over different structure.
 * The route hands over `POPULATED_SCHEDULE`; pointing that import at
 * `EMPTY_SCHEDULE` is the whole of what it takes to render the other artboard.
 *
 * ── Selection ─────────────────────────────────────────────────────────────
 * The drawer's rows and the pane's "Jump to" rows both move one piece of local
 * state and nothing else — no route change, no fetch. Selecting an event whose
 * detail carries a lineup swaps the prompt pane for `DualWidget`, which is
 * `7c` at 620px and `4c` at 860px; that walk — `7d` → `7c` → `4c` — is one
 * `useState` and a window resize, and nothing else moves.
 *
 * A selection the details map cannot answer falls back to the same prompt
 * pane. `EVENT_DETAILS` is deliberately partial — two of the four drawn rows
 * have no designed pane, and Ridgeline's detail exists with no entries because
 * `7d` says its lineup is not set — so "no pane for this row" is a state the
 * design has already answered rather than one to invent a pane for.
 *
 * ── Chrome ────────────────────────────────────────────────────────────────
 * The sidebar and the 44px breadcrumb topbar the artboards draw are the app's
 * own and already on screen. See `event-drawer.tsx`'s header for the one drawn
 * element that has nowhere to go — the topbar's event count.
 */
export function StaticSchedule({
  schedule,
  canCreate,
  canAddOwnMatch,
}: {
  /**
   * Aliased on import: `fixtures.ts` exports this shape as `StaticSchedule`
   * too, and the component owns that name here.
   */
  schedule: StaticScheduleData;
  /** `isProgramStaff` upstream — gates the drawer-footed "New event" CTA. */
  canCreate: boolean;
  /**
   * `canUploadForProgram` upstream — gates `7e`'s "One-off match in Matches".
   * `7e` is the only artboard in this task's set that draws such a control, so
   * the prop stays rather than being dropped with the rest of the route's data.
   */
  canAddOwnMatch: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A dual with at least one entry is the only thing `DualWidget` can draw:
  // `7c`/`4c` are a lineup, and a lineup with no lines is `7d`'s "lineup not
  // set", not an empty widget. The `kind` test is not redundant with it — a
  // tournament detail would satisfy the entry count and is a different pane.
  const selected = selectedId ? (schedule.details[selectedId] ?? null) : null;
  const dual =
    selected && selected.event.kind === "dual" && selected.entries.length > 0
      ? selected
      : null;

  return (
    <div className="flex min-h-0 w-full flex-1 bg-[var(--surface-card)]">
      <EventDrawer
        rows={schedule.rows}
        selectedId={selectedId}
        onSelect={setSelectedId}
        canCreate={canCreate}
      />
      {schedule.rows.length === 0 ? (
        <DayZeroPane canAddOwnMatch={canAddOwnMatch} />
      ) : dual ? (
        <DualWidget detail={dual} />
      ) : (
        <SelectAnEventPane schedule={schedule} onSelect={setSelectedId} />
      )}
    </div>
  );
}

/** The pane's own box — `padding: 32px 32px 24px` on both artboards. */
function Pane({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col px-8 pb-6 pt-8">{children}</div>
  );
}

/**
 * `7d`'s prompt pane: the title, the season strip, and the two jump rows.
 */
function SelectAnEventPane({
  schedule,
  onSelect,
}: {
  schedule: StaticScheduleData;
  onSelect: (eventId: string) => void;
}) {
  const next = schedule.rows.find((row) => row.playedCount === 0) ?? null;
  const last = schedule.rows.find((row) => row.playedCount > 0) ?? null;

  // "hard". A surface belongs to the event, not to the row the drawer lists,
  // so it comes from the detail — and the detail map is deliberately partial,
  // hence the optional chain rather than an assumed hit.
  const nextSurface = next ? schedule.details[next.id]?.event.surface : null;

  return (
    <Pane>
      <span className="text-title-lg" style={{ letterSpacing: "-.5px" }}>
        Select an event
      </span>
      <div className="text-body-sm mt-2.5 max-w-[46ch] text-pretty">
        Pick a dual or tournament on the left to see its lineup, every
        line&apos;s result and the report behind each one.
      </div>

      <div className="mt-[22px] flex items-center gap-3.5">
        <span className="eyebrow-sm">Season</span>
        {/* One loss then three wins, exactly as drawn. NOT derived: the four
            marks claim a fourth completed dual that no artboard names, which
            is the same gap `SEASON_FACTS` records ("3–1 in duals" over three
            drawn results, all of them wins). Reproduced as drawn and reported;
            deriving it would mean inventing the event the design never wrote. */}
        <div className="flex items-center gap-1.5">
          <CircleX
            size={14}
            strokeWidth={1.5}
            className="text-[var(--viz-bad)]"
          />
          <CircleCheck
            size={14}
            strokeWidth={1.5}
            className="text-[var(--viz-good)]"
          />
          <CircleCheck
            size={14}
            strokeWidth={1.5}
            className="text-[var(--viz-good)]"
          />
          <CircleCheck
            size={14}
            strokeWidth={1.5}
            className="text-[var(--viz-good)]"
          />
        </div>
        <span className="h-3 w-px bg-[var(--border-medium)]" />
        <span className="text-body-sm">{tabularNumerals(SEASON_FACTS)}</span>
      </div>

      <div className="min-h-0 flex-1" />

      <div className="flex flex-col gap-0.5 border-t border-[var(--border-hairline)] pt-3.5">
        <span className="eyebrow-sm pb-1.5">Jump to</span>

        {next ? (
          <JumpRow
            label="Next"
            row={next}
            detail={
              <>
                {factsLine(next)}
                {nextSurface ? ` · ${nextSurface}` : null}
                {next.entryCount === 0 ? " · lineup not set" : null}
              </>
            }
            /* "in 4 days" is the design's, and the rows cannot produce it: the
               fixture calendar is September 2025 and today is not four days
               before it. A literal, flagged, rather than a clock read that
               would print something the artboard never says. */
            trailing={
              <span className="text-micro tabular text-right">in 4 days</span>
            }
            onSelect={onSelect}
          />
        ) : null}

        {last ? (
          <JumpRow
            label="Last"
            row={last}
            detail={
              <>
                {factsLine(last)} ·{" "}
                {/* "8 of 9 lines analyzed" is the design's own claim and is
                    not derivable from the rows it draws — three of the nine
                    lines are doubles, which carry no video at all. T1 flagged
                    it against the fixtures; it is reproduced here verbatim
                    rather than recomputed into a different number. */}
                <span className="tabular">8</span> of{" "}
                <span className="tabular">9</span> lines analyzed
              </>
            }
            trailing={
              last.teamScore ? (
                <span className="tabular text-right text-[14px] text-[var(--ink-900)]">
                  {last.teamScore.us}–{last.teamScore.them}
                </span>
              ) : null
            }
            onSelect={onSelect}
          />
        ) : null}
      </div>
    </Pane>
  );
}

/** "Fri 26 Sep · Home" — the two facts every drawn row carries. */
function factsLine(row: ScheduleRow): string {
  return `${formatEventDay(row.startsOn)} · ${siteTitle(row.site)}`;
}

/**
 * One "Jump to" row. Selects its event — the same local state the drawer moves.
 */
function JumpRow({
  label,
  row,
  detail,
  trailing,
  onSelect,
}: {
  label: string;
  row: ScheduleRow;
  detail: React.ReactNode;
  trailing: React.ReactNode;
  onSelect: (eventId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      className={cn(
        "-mx-3 grid cursor-pointer grid-cols-[60px_minmax(0,1fr)_92px_13px] items-center gap-4",
        "rounded-[var(--radius-element)] px-3 py-[11px] text-left",
        "transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)]"
      )}
    >
      <span className="text-micro">{label}</span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="text-[13px] font-medium text-[var(--ink-900)]">
          vs {row.name}
        </span>
        <span className="text-micro" style={{ color: "var(--ink-600)" }}>
          {detail}
        </span>
      </span>
      {trailing}
      <ChevronRight
        size={13}
        strokeWidth={1.5}
        className="text-[var(--ink-300)]"
      />
    </button>
  );
}

/** `7e`'s pane: the empty state over the nine-line scaffold. */
function DayZeroPane({ canAddOwnMatch }: { canAddOwnMatch: boolean }) {
  return (
    <Pane>
      <span className="text-title-lg" style={{ letterSpacing: "-.5px" }}>
        No events yet
      </span>
      <div className="text-body-sm mt-2.5 max-w-[46ch] text-pretty">
        Create a dual and the lineup card builds itself — every slot becomes a
        real match the moment you set the line.
      </div>

      <div className="mt-3.5 flex items-center gap-2.5">
        {/* The artboard points these at `#3b` and `#3c`, which are the
            choose-type and tournament screens — `/dashboard/team/schedule/new`
            and `.../new/tournament`, both inside this run's rebuilt set. */}
        <Link href="/dashboard/team/schedule/new" className={LINK_CLASS}>
          New dual
        </Link>
        <Separator />
        <Link
          href="/dashboard/team/schedule/new/tournament"
          className={LINK_CLASS}
        >
          New tournament
        </Link>
        {canAddOwnMatch ? (
          <>
            <Separator />
            {/* Inert on purpose. The artboard points this one at `#7e` — its
                own frame, i.e. nowhere — and its real destination
                `/dashboard/matches/new` is outside the four routes this run
                rebuilds, which the brief puts off to later work. Drawn, gated
                by the same `canUploadForProgram` the DB-wired empty state used,
                and not wired. */}
            <span className={LINK_CLASS}>One-off match in Matches</span>
          </>
        ) : null}
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col self-stretch overflow-hidden rounded-[var(--radius-element)] border border-dashed border-[var(--border-medium)] px-5 pb-[18px] pt-4">
        <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-2.5">
          <span className="eyebrow">What a dual creates</span>
          <div className="flex-1" />
          <span className="text-micro" style={{ color: "var(--ink-400)" }}>
            <span className="tabular">9</span> lines · none set
          </span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[auto_repeat(6,minmax(34px,1fr))] gap-x-7 pt-2">
          <span className="eyebrow-sm self-center">Singles</span>
          <span className="eyebrow-sm self-center">Doubles</span>

          <ScaffoldSlot slot="S1" />
          <ScaffoldSlot slot="D1" />
          <ScaffoldSlot slot="S2" />
          <ScaffoldSlot slot="D2" />
          <ScaffoldSlot slot="S3" />
          <ScaffoldSlot slot="D3" />
          {/* Explicitly column one, or auto-placement would run S5 into the
              doubles column beside S4. */}
          <ScaffoldSlot slot="S4" className="col-start-1" />
          <ScaffoldSlot slot="S5" className="col-start-1" />
          <ScaffoldSlot slot="S6" className="col-start-1" />

          <div className="col-start-2 row-start-5 row-end-8 flex flex-col gap-[5px] self-end">
            <span className="text-micro max-w-[32ch] text-pretty">
              Opponent, format and lets are typed once and inherit down every
              line.
            </span>
            <span className="text-micro" style={{ color: "var(--ink-400)" }}>
              The team score adds itself up as lines resolve.
            </span>
          </div>
        </div>
      </div>
    </Pane>
  );
}

/** One scaffold line: the slot's label and the dot standing in for its result. */
function ScaffoldSlot({
  slot,
  className,
}: {
  slot: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="mono w-[22px] text-[11px] font-normal text-[var(--ink-500)]">
        {slot}
      </span>
      <span className="h-[5px] w-[5px] rounded-full bg-[var(--ink-200)]" />
    </div>
  );
}

/**
 * `--blue-text`, not the `--blue` the design file's `a` rule resolves to.
 *
 * The artboard sets only size and weight on these links and inherits colour
 * from DS v3's `tokens/base.css` (`a{color:var(--blue)}`) — a file
 * `src/styles/design-system/index.css` deliberately does not import, because
 * globals.css owns the anchor reset. `--blue` measures 3.68:1 on white and
 * fails WCAG 1.4.3 AA under 24px; `colors.css` added `--blue-text` for exactly
 * this ("use this the moment blue becomes a word") and twelve surfaces already
 * use it. Same hover target the rest of them take.
 */
const LINK_CLASS =
  "text-[12px] font-medium text-[var(--blue-text)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)]";

function Separator() {
  return <span className="text-[12px] text-[var(--ink-300)]">·</span>;
}

/**
 * Wrap each run of digits in a `.tabular` span.
 *
 * `SEASON_FACTS` is one flat string in the fixtures; `7d` draws its numerals —
 * 3, 1, 31, 36 — each inside `<span class="tabular">`, with the en dash
 * between the first two left outside. Splitting on digit runs reproduces that
 * markup exactly and keeps the sentence itself in one place. Writing the spans
 * out by hand would put a second copy of the copy here, which is the drift
 * T10's spec exists to catch.
 */
function tabularNumerals(text: string): React.ReactNode[] {
  return text
    .split(/(\d+)/)
    .filter(Boolean)
    .map((part, index) =>
      /^\d+$/.test(part) ? (
        <span key={index} className="tabular">
          {part}
        </span>
      ) : (
        part
      )
    );
}
