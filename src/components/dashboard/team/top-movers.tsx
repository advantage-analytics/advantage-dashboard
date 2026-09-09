import Link from "next/link";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import {
  DayZeroShape,
  GHOST_OPACITY,
  GhostRule,
} from "@/components/dashboard/home/day-zero-shape";
import { advButton } from "@/lib/ui/adv-button";
import { formatDelta } from "@/lib/data/match-utils";
import type { TopMover } from "@/lib/data/team-movers";

/**
 * Top movers — Platform Audit Ta3, on Ta2's metric · value · delta track.
 *
 * Who changed the most, and in what. The ranking is `lib/data/team-movers.ts`
 * over the Roster page's own per-player measures; this file draws seven rows
 * of it and adds no arithmetic. A row is a link into the player's profile —
 * where the same measure, the same window and the same delta are drawn in
 * full.
 *
 * **Always on the page.** With nobody moving yet — a new roster, or one
 * whose players have not played their second week — the card holds its slot
 * with three ghost rows and one band saying when the list fills. When the
 * roster itself is empty the band's action is the roster page, because that
 * is the step before any of this.
 */
const ROW =
  "grid grid-cols-[26px_minmax(100px,1fr)_74px_minmax(150px,170px)] items-center gap-3.5 rounded-[var(--radius-element)] px-3 py-[11px] -mx-3 transition-colors duration-150 hover:bg-[var(--surface-muted)] has-[:focus-visible]:bg-[var(--surface-muted)]";

/** The fade the product's day-zero rows share — see `GHOST_OPACITY`. */
const GHOST_ROWS = GHOST_OPACITY.slice(0, 3);

export function TopMovers({
  movers,
  rosterSize,
  canManage,
}: {
  movers: TopMover[];
  rosterSize: number;
  /** Staff — the only people the "Add players" band can send to the roster. */
  canManage: boolean;
}) {
  return (
    <section aria-label="Top movers" className="surface-card min-w-0 p-5">
      <div className="flex items-center gap-3">
        <span className="eyebrow">Top movers</span>
        <span className="text-micro">biggest change since last week</span>
        <div className="flex-1" />
        <Link
          href="/dashboard/team/roster"
          className="text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          Full roster
          {rosterSize > 0 ? (
            <>
              {" "}
              — <span className="tabular">{rosterSize}</span>
            </>
          ) : null}
        </Link>
      </div>

      {movers.length > 0 ? (
        <div className="mt-2 flex flex-col">
          {movers.map((mover) => (
            <Row key={mover.playerId} mover={mover} />
          ))}
        </div>
      ) : (
        <Empty rosterEmpty={rosterSize === 0} canManage={canManage} />
      )}
    </section>
  );
}

function Row({ mover }: { mover: TopMover }) {
  const delta = formatDelta(mover.delta);
  return (
    <Link href={`/dashboard/team/roster/${mover.playerId}`} className={ROW}>
      <InitialsAvatar name={mover.name} />
      <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
        {mover.name}
      </span>
      <span className="flex items-center">
        <FormTicks form={mover.form} empty={null} />
      </span>
      <span className="grid grid-cols-[1fr_40px_30px] items-baseline gap-2">
        <span className="text-micro whitespace-nowrap">{mover.metric}</span>
        <span className="tabular text-right text-[13px] font-medium text-[var(--ink-900)]">
          {mover.value}%
        </span>
        <span
          className="tabular text-right text-[11px] whitespace-nowrap"
          style={{ color: delta.color }}
        >
          {delta.label}
        </span>
      </span>
    </Link>
  );
}

function Empty({
  rosterEmpty,
  canManage,
}: {
  rosterEmpty: boolean;
  canManage: boolean;
}) {
  return (
    <>
      <DayZeroShape
        description={
          rosterEmpty
            ? "Nobody on the roster yet."
            : "Nobody has enough matches to show a change yet."
        }
        className="mt-2 flex flex-col"
      >
        {GHOST_ROWS.map((opacity) => (
          <div
            key={opacity}
            className="flex h-[48px] items-center gap-3.5"
            style={{ opacity }}
          >
            <span className="size-[26px] shrink-0 rounded-full bg-[var(--ink-100)]" />
            <GhostRule width="120px" tone="200" shape="tall" />
            <div className="flex-1" />
            <GhostRule width="70px" />
            <GhostRule width="28px" tone="200" />
          </div>
        ))}
      </DayZeroShape>

      <div className="mt-2.5 flex flex-wrap items-center gap-5 border-t border-[var(--border-hairline)] pt-[22px] pb-1">
        <div className="min-w-0 flex-1">
          <span className="block text-[13px] leading-[1.4] font-medium text-[var(--ink-900)]">
            {rosterEmpty
              ? "Nothing here until players are on the roster"
              : "Movers appear after a player's second week of matches"}
          </span>
          <span
            className="text-body-sm mt-[3px] block"
            style={{ textWrap: "pretty" }}
          >
            {rosterEmpty
              ? "Add players by name, or invite them to claim a profile. Their matches follow."
              : "Each player's biggest change in serve and pressure numbers, against everything earlier."}
          </span>
        </div>
        {rosterEmpty && canManage && (
          <Link
            href="/dashboard/team/roster"
            className={`${advButton("primary")} shrink-0`}
          >
            Add players
          </Link>
        )}
      </div>
    </>
  );
}
