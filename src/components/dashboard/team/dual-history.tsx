import Link from "next/link";
import { ResultMark } from "@/components/dashboard/result-mark";
import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import { EventMark } from "@/components/dashboard/schedule/static/event-mark";
import { CardFooter } from "@/components/dashboard/shared/card-footer";
import {
  DayZeroShape,
  GHOST_OPACITY,
  GhostRule,
} from "@/components/dashboard/home/day-zero-shape";
import { siteTitle } from "@/lib/schedule/format";
import type { DualHistoryRow } from "@/lib/data/team-home-server";

/**
 * Dual match history — the 340px rail on Team Home (Platform Audit Ta3,
 * kept from 44a).
 *
 * The season's decided duals, newest first, four of them, each a link into
 * the event. The team score comes off `ScheduleRow.teamScore`, which the
 * schedule page prints under the same rule — a dual is decided only once every
 * line is in — so a 4–3 here and a 4–3 on the schedule are one number.
 *
 * The footer holds the season's form strip and its record. The frame writes
 * "6–1 in conference"; nothing in the schema knows which duals are conference
 * play, so this says "this season" and counts every decided dual.
 *
 * **Always on the page.** Before the first decided dual the card draws three
 * ghost rows and a footer saying when it fills.
 */
const ROW =
  "grid h-[52px] grid-cols-[32px_minmax(0,1fr)_15px_44px] items-center gap-3 rounded-[var(--radius-element)] px-2 -mx-2 transition-colors duration-150 hover:bg-[var(--surface-muted)] has-[:focus-visible]:bg-[var(--surface-muted)]";

/** The fade the product's day-zero rows share — see `GHOST_OPACITY`. */
const GHOST_ROWS = GHOST_OPACITY.slice(0, 3);

export function DualHistory({
  rows,
  form,
  teamName,
}: {
  rows: DualHistoryRow[];
  form: { form: ("win" | "loss")[]; wins: number; losses: number };
  /** The program's own name for the footer's "Meridian form". */
  teamName: string;
}) {
  return (
    <section
      aria-label="Dual match history"
      className="surface-card flex min-w-0 flex-col gap-0.5 p-5"
    >
      <div className="flex items-center gap-2.5 pb-3">
        <span className="eyebrow">Dual match history</span>
        <div className="flex-1" />
        <Link
          href="/dashboard/team/schedule"
          className="text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          All duals
        </Link>
      </div>

      {rows.length > 0 ? (
        rows.map((row) => <Row key={row.id} row={row} />)
      ) : (
        <DayZeroShape description="No dual decided yet." className="flex flex-col">
          {GHOST_ROWS.map((opacity) => (
            <div
              key={opacity}
              className="flex h-[52px] items-center gap-3"
              style={{ opacity }}
            >
              <span className="size-8 shrink-0 rounded-[var(--radius-button)] bg-[var(--ink-100)]" />
              <div className="flex flex-1 flex-col gap-2">
                <GhostRule width="96px" tone="200" shape="tall" />
                <GhostRule width="64px" />
              </div>
              <GhostRule width="30px" tone="200" shape="tall" />
            </div>
          ))}
        </DayZeroShape>
      )}

      {/* `CardFooter`, the hairline footer every Home card closes on: the
          form strip where the caption goes, the record where the count goes. */}
      <CardFooter
        className="mt-1.5"
        left={
          rows.length > 0 ? (
            <span className="inline-flex items-center gap-2">
              <span className="eyebrow-sm">{shortTeamName(teamName)} form</span>
              <FormTicks form={form.form} empty={null} />
            </span>
          ) : (
            "Results land here after the first dual"
          )
        }
        right={
          rows.length > 0 ? (
            <span className="tabular">
              {form.wins}–{form.losses} this season
            </span>
          ) : undefined
        }
      />
    </section>
  );
}

function Row({ row }: { row: DualHistoryRow }) {
  // Who won follows from the pair — the loader ships the two figures and no
  // third field restating what they already say.
  const won = row.us > row.them;
  return (
    <Link href={`/dashboard/team/schedule/${row.id}`} className={ROW}>
      <EventMark kind="dual" name={row.opponent} size={32} />
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate text-[13px] text-[var(--ink-900)]">{row.opponent}</span>
        <span className="whitespace-nowrap text-[11px] text-[var(--ink-500)]">
          {siteTitle(row.site)} · <span className="mono">{row.date}</span>
        </span>
      </span>
      <ResultMark won={won} className="size-[15px]" />
      <Score us={row.us} them={row.them} won={won} />
    </Link>
  );
}

/** 16px light figures; the winner's in ink-900, the loser's in ink-500. */
function Score({ us, them, won }: { us: number; them: number; won: boolean }) {
  const figure = "tabular text-[16px] font-light";
  return (
    <span className="flex items-baseline justify-end gap-[3px] whitespace-nowrap">
      <span className={figure} style={{ color: won ? "var(--ink-900)" : "var(--ink-500)" }}>
        {us}
      </span>
      <span className={figure} style={{ color: "var(--ink-300)" }}>
        –
      </span>
      <span className={figure} style={{ color: won ? "var(--ink-500)" : "var(--ink-900)" }}>
        {them}
      </span>
    </span>
  );
}

/** "Meridian State University" → "Meridian": the frame's one-word form label. */
function shortTeamName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
