"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MoreHorizontal,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AdvSwitch } from "@/components/ui/adv-switch";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { playedSets } from "@/lib/ui/score-format";
import { RECENT_MATCH_GRID } from "@/components/dashboard/team/player-drawer-layout";
import { advButton } from "@/lib/ui/adv-button";
import { capitalize, cn } from "@/lib/utils";
import { formatDelta, getInitials } from "@/lib/data/match-utils";
import {
  archiveProgramPlayer,
  setMemberUploadEnabled,
} from "@/components/dashboard/team/roster-actions";
import {
  removeMember,
  type InviteResult,
} from "@/components/dashboard/settings/team-actions";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import { profileHref } from "@/components/dashboard/team/roster-table";
import type {
  RosterMeasure,
  RosterMember,
  RosterRecentMatch,
} from "@/lib/data/team-roster-server";

/**
 * The roster's 340px player drawer — Platform Audit `Tb4`, spec'd in Updated
 * Design System `20a`/`20c`/`20f`.
 *
 * "Row distilled to what you compare, drawer keeps what you read." Identity →
 * one-line stat header with a six-match sparkline (hover any match for value,
 * opponent and date) → four stat pills that switch the chart — both only
 * where a figure exists, see `hasStats` → three recent
 * matches → full-width Upload. Header controls inset 20px to match the page
 * header; ‹ › step players, and the name below bridges to the page.
 *
 * ── Opening and closing (20f) ───────────────────────────────────────────────
 * The drawer slides in from the right edge over 200ms on `--ease-primary` and
 * the table reflows to the remaining width. It is the WIDTH that animates
 * (`roster-drawer-in` / `-out` in globals.css) rather than a transform: the
 * reflow is the point, and a transform would slide a panel over a table that
 * had already jumped. The panel inside is a fixed 340px, left-anchored, so
 * what shows during the slide is its left edge arriving — the same picture a
 * transform would paint, without the second layout.
 *
 * Closing is the reverse animation; `onClosed` fires when it ends and the
 * parent unmounts this. Under reduced motion the animation is dropped and the
 * parent's timeout does the unmounting.
 *
 * ── Sticky ─────────────────────────────────────────────────────────────────
 * The frames draw the drawer filling the height beside the page. In the app
 * the page scrolls under a 44px sticky header, so the drawer is `sticky` at
 * `top: 44px` with the viewport's remaining height: a long roster scrolls
 * and the drawer stays put, exactly as a fixed column would in the frame.
 *
 * ── The menu ───────────────────────────────────────────────────────────────
 * The row used to carry a ⋯ menu (Can send video · Edit player · Remove) and
 * `Tb4` removed the action gutter without drawing that menu anywhere else.
 * Those three are product actions the roster cannot lose, so the menu lives
 * in the drawer's header, beside "Open profile", as one more 28px icon
 * control — the one addition to the frame, and the smallest one that keeps
 * every write reachable.
 */

const ICON_BUTTON =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40";

/** The drawer's `role="dialog"` carries this so the window key handler can tell it from a modal. */
export const DRAWER_ATTR = "data-roster-drawer";

/**
 * "#3 singles · Freshman" — the identity line under the name.
 *
 * Spot first, then year, the order `Tb4` draws ("#3 Singles · Freshman").
 * Handedness is in the frame and not in the schema, so it is not invented.
 * Staff get their role; a player with neither fact gets their address, and
 * "On the roster" is the floor.
 */
function identityLine(member: RosterMember): string {
  if (member.role !== "player") return capitalize(member.role);
  const parts: string[] = [];
  if (member.lineupSpot !== null) parts.push(`#${member.lineupSpot} singles`);
  if (member.classYear) parts.push(member.classYear);
  if (parts.length > 0) return parts.join(" · ");
  return member.email ?? "On the roster";
}

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

/* ── Sparkline ────────────────────────────────────────────────────────────── */

const SPARK_W = 296;
const SPARK_H = 56;
/** Room for the 1.25px stroke's round caps and the r=2 end dot. */
const SPARK_PX = 3;
const SPARK_PY = 6;

interface SparkPoint {
  value: number;
  match: RosterRecentMatch;
}

/**
 * Six matches, oldest to newest, for one measure.
 *
 * `Tb4`: 296×56, `--viz-you` stroke 1.25, 18%→0 area fill, end dot r2. Hover
 * any match for a hairline, a hollow dot on the line, and a dark tip with the
 * value over "opponent · date". The tip hangs below the chart and shifts at
 * the two ends so it never leaves the 296px box.
 */
function Sparkline({ label, points }: { label: string; points: SparkPoint[] }) {
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="flex h-14 w-[296px] items-center text-[11px] text-[var(--ink-400)]">
        {points.length === 1
          ? "One match with this figure — the line starts at two."
          : "No matches with this figure yet."}
      </div>
    );
  }

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  // A flat run would otherwise divide by zero and sit on the floor; centre it.
  if (max - min < 1) {
    min -= 1;
    max += 1;
  }
  const n = points.length;
  const coords = points.map((p, i) => ({
    x: SPARK_PX + (i / (n - 1)) * (SPARK_W - SPARK_PX * 2),
    y:
      SPARK_H -
      SPARK_PY -
      ((p.value - min) / (max - min)) * (SPARK_H - SPARK_PY * 2),
  }));
  const xy = (c: { x: number; y: number }) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`;
  const line = coords.map(xy).join(" ");
  const area = `M ${coords[0].x.toFixed(2)},${SPARK_H} ${coords
    .map((c) => `L ${xy(c)}`)
    .join(" ")} L ${coords[n - 1].x.toFixed(2)},${SPARK_H} Z`;
  const last = coords[n - 1];

  return (
    <div
      className="relative h-14 w-[296px]"
      role="img"
      aria-label={`${label} over the last ${n} matches: ${points
        .map((p) => `${Math.round(p.value)}% against ${p.match.opponent}`)
        .join(", ")}`}
    >
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        width={SPARK_W}
        height={SPARK_H}
        className="block overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--viz-you)" stopOpacity={0.18} />
            <stop offset="1" stopColor="var(--viz-you)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path
          d={area}
          fill={`url(#${gradientId})`}
          style={{ transition: "d 300ms var(--ease-primary)" }}
        />
        <polyline
          points={line}
          fill="none"
          stroke="var(--viz-you)"
          strokeWidth={1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last.x} cy={last.y} r={2} fill="var(--viz-you)" />
      </svg>

      {/* One hit region per match, split at the midpoints between neighbours,
          8px taller than the chart at both edges so the dot and the hairline
          have room to draw. */}
      {points.map((point, i) => {
        const left = i === 0 ? 0 : (coords[i - 1].x + coords[i].x) / 2;
        const right = i === n - 1 ? SPARK_W : (coords[i].x + coords[i + 1].x) / 2;
        const lineX = coords[i].x - left;
        const shift = i === 0 ? "0" : i === n - 1 ? "-100%" : "-50%";
        const active = hovered === i;
        return (
          <div
            key={point.match.id}
            className="absolute -top-2 -bottom-2"
            style={{ left, width: right - left }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            {active && (
              <>
                <div
                  aria-hidden
                  className="absolute top-2 bottom-2 w-px bg-[var(--ink-300)]"
                  style={{ left: lineX }}
                />
                <div
                  aria-hidden
                  className="absolute size-[7px] rounded-full border-[1.5px] border-[var(--viz-you)] bg-[var(--surface-card)]"
                  style={{ left: lineX - 3.5, top: coords[i].y + 8 - 3.5 }}
                />
                <div
                  role="tooltip"
                  className="absolute z-[3] flex flex-col gap-0.5 rounded-[var(--radius-element)] bg-[var(--ink-900)] px-[9px] py-1.5 whitespace-nowrap text-white shadow-[var(--shadow-dropdown)]"
                  style={{
                    top: "calc(100% - 4px)",
                    left: lineX,
                    transform: `translateX(${shift})`,
                  }}
                >
                  <span className="tabular text-[12px] leading-[1.2] font-medium">
                    {Math.round(point.value)}%
                  </span>
                  <span className="text-[10px] leading-[1.2] text-[var(--ink-300)]">
                    {point.match.opponent} · {point.match.date}
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Stat pills ───────────────────────────────────────────────────────────── */

/**
 * One of the four. `20c`: 19f pill anatomy — the selected one carries
 * `--border-medium` + `--surface-subtle`, the rest a hairline on nothing.
 * The frame draws them 26px tall, so 26 it is.
 */
function StatPill({
  measure,
  selected,
  onSelect,
}: {
  measure: RosterMeasure;
  selected: boolean;
  onSelect: () => void;
}) {
  const delta = measure.trend === null ? null : formatDelta(measure.trend);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 text-[11px] text-[var(--ink-600)]",
        "transition-colors duration-[var(--duration-hover)] ease-[var(--ease-primary)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        selected
          ? "border-[var(--border-medium)] bg-[var(--surface-subtle)]"
          : "border-[var(--border-hairline)] bg-transparent"
      )}
    >
      {measure.pill}
      <span className="tabular text-[var(--ink-900)]">{percent(measure.value)}</span>
      {delta && (
        <span className="tabular font-medium" style={{ color: delta.color }}>
          {delta.label}
        </span>
      )}
    </button>
  );
}

/* ── The row menu, relocated ──────────────────────────────────────────────── */

/**
 * The permission, the correction, and the way off the roster.
 *
 * Owners are absent from the removal case: ownership moves by transfer, and a
 * roster screen is not where a program should be able to lose the only person
 * who runs it.
 */
function MemberMenu({
  member,
  isViewer,
  onEdit,
  onError,
  run,
  pending,
}: {
  member: RosterMember;
  isViewer: boolean;
  onEdit: () => void;
  onError: (message: string | null) => void;
  run: (action: () => Promise<ActionResult | InviteResult>) => void;
  pending: boolean;
}) {
  const [enabled, setEnabled] = useState(member.uploadEnabled);
  const [sending, startSend] = useTransition();
  /**
   * Controlled so Edit can close the menu itself. Both the popover and the
   * dialog trap focus, so the two must not overlap: setting this false in the
   * same event as `onEdit` puts both in one commit — the popover unmounts and
   * returns focus, then the dialog mounts and takes it.
   */
  const [menuOpen, setMenuOpen] = useState(false);

  // Players only, and not merely the owner. `canUploadForProgram()` answers
  // for owner, coach and staff before it reads `upload_enabled`, so on a staff
  // row this switch would move, write, and change nothing anyone could
  // observe. A coach-managed player has no account to grant it to.
  const canToggleSend = member.userId !== null && member.role === "player";
  const canRemove = member.role !== "owner" && !isViewer;
  // Gated on there being a profile row to write. A coach and a claimed player
  // both have one; staff seats do not.
  const canEdit = member.profileId !== null;
  const grantSlotFilled = canToggleSend || member.role === "player";

  if (!canToggleSend && !canRemove && !canEdit) return null;

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <ChromeTooltip label="Options" hidden={menuOpen}>
        <PopoverTrigger
          aria-label={`Options for ${member.name}`}
          className={ICON_BUTTON}
        >
          <MoreHorizontal className="size-3.5" strokeWidth={1.5} aria-hidden />
        </PopoverTrigger>
      </ChromeTooltip>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[248px] rounded-[var(--radius-dropdown)] p-2"
      >
        {canToggleSend ? (
          <div className="flex items-start gap-3 rounded-[var(--radius-element)] px-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-[var(--ink-900)]">
                Can send video
              </span>
              <span className="block text-[11px] leading-[1.5] text-[var(--ink-500)]">
                Spends the program&apos;s analysis time
              </span>
            </span>
            <AdvSwitch
              checked={enabled}
              disabled={sending}
              label={`Let ${member.name} send video`}
              onCheckedChange={(next) => {
                // Moved before the await so the switch answers the press
                // immediately, and put back if the server refuses.
                setEnabled(next);
                onError(null);
                startSend(async () => {
                  const result = await setMemberUploadEnabled(
                    member.userId as string,
                    next
                  );
                  if (!result.ok) {
                    setEnabled(!next);
                    onError(result.error);
                  }
                });
              }}
            />
          </div>
        ) : (
          member.role === "player" && (
            <p className="px-2 py-2 text-[11px] leading-[1.5] text-[var(--ink-500)]">
              No account yet, so there is no analysis time to grant. Invite them
              to hand over their own uploads.
            </p>
          )
        )}

        {grantSlotFilled && (canEdit || canRemove) && (
          <span className="my-1 block h-px bg-[var(--border-hairline)]" />
        )}

        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onError(null);
              onEdit();
            }}
            className="block w-full rounded-[var(--radius-element)] px-2 py-2 text-left text-[12px] text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
          >
            Edit player
          </button>
        )}

        {canRemove && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() =>
                // A coach-managed player has no membership row to remove, so
                // the profile is archived instead — which also keeps their
                // matches attributable.
                member.profileId
                  ? archiveProgramPlayer(member.profileId)
                  : removeMember(member.userId as string)
              )
            }
            className="block w-full rounded-[var(--radius-element)] px-2 py-2 text-left text-[12px] text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--danger)] disabled:opacity-50"
          >
            Remove from roster
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ── The drawer ───────────────────────────────────────────────────────────── */

export function PlayerDrawer({
  member,
  index,
  total,
  canManage,
  isViewer,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
  onEdit,
  onError,
  run,
  pending,
}: {
  member: RosterMember;
  /** Zero-based position among the rows `↑`/`↓` walk. */
  index: number;
  total: number;
  canManage: boolean;
  isViewer: boolean;
  /** Playing the slide-out; `onClosed` fires when it finishes. */
  closing: boolean;
  /** Opened from the keyboard — take focus so `Tab` continues inside. */
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
  onEdit: (member: RosterMember) => void;
  onError: (message: string | null) => void;
  run: (action: () => Promise<ActionResult | InviteResult>) => void;
  pending: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Which of the four the chart shows. Held here rather than per member so
  // stepping ↑↓ through the roster compares players on the same figure.
  const [activeKey, setActiveKey] = useState(member.measures[0]?.key ?? "");
  const active =
    member.measures.find((m) => m.key === activeKey) ?? member.measures[0];

  useEffect(() => {
    if (autoFocus) panelRef.current?.focus({ preventScroll: true });
  }, [autoFocus, member.playerId]);

  // Oldest first — a season reads left to right — and only the matches that
  // measured this figure; a video still in analysis is a gap, not a zero.
  const points: SparkPoint[] = active
    ? member.recent
        .slice()
        .reverse()
        .flatMap((match) => {
          const value = match.values[active.key];
          return value === null || value === undefined ? [] : [{ value, match }];
        })
    : [];
  const heroDelta =
    active && active.trend !== null ? formatDelta(active.trend) : null;

  /**
   * Is there a figure to show at all?
   *
   * Not "has matches" — a player whose only match is still in analysis has a
   * recent row and no measured values, which is the same nothing to chart.
   * With every measure null the header read "—", the sparkline drew empty air
   * between two blank dates, and the four pills stayed clickable: a coach
   * could press one, watch it select, and watch nothing else happen. Controls
   * that respond and do nothing are worse than absent.
   *
   * The design system's honest-zero rule asks for the region's own anatomy
   * with a mark where each value goes, and that is right for a card on a page
   * — the labels tell you what comes back. It also says to scale the
   * treatment down as the region does, and this region is a 340px rail: four
   * dead buttons and an empty chart is not anatomy, it is furniture. So the
   * labels come back as one sentence under Recent matches, and the way to
   * make them appear is already the drawer's primary.
   */
  const hasStats = member.measures.some((measure) => measure.value !== null);
  const firstName = member.name.split(" ")[0];
  const profile = profileHref(member.playerId);

  return (
    <aside
      {...{ [DRAWER_ATTR]: "" }}
      onAnimationEnd={(event) => {
        if (event.animationName === "roster-drawer-out") onClosed();
      }}
      className={cn(
        "sticky top-11 z-[2] h-[calc(100vh-44px)] shrink-0 self-start overflow-hidden border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)] motion-reduce:animate-none",
        closing
          ? "w-0 animate-[roster-drawer-out_200ms_var(--ease-primary)_both]"
          : "w-[340px] animate-[roster-drawer-in_200ms_var(--ease-primary)_both]"
      )}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label={member.name}
        tabIndex={-1}
        className="flex h-full w-[340px] flex-col outline-none"
      >
        {/* 44px, inset 20px — the page header's own height and inset, so the
            two rules line up across the border. */}
        <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--border-hairline)] px-5">
          <ChromeTooltip label="Previous player" shortcut="↑">
            <button
              type="button"
              aria-label="Previous player"
              disabled={index === 0}
              onClick={onPrev}
              className={ICON_BUTTON}
            >
              <ChevronUp className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </ChromeTooltip>
          <ChromeTooltip label="Next player" shortcut="↓">
            <button
              type="button"
              aria-label="Next player"
              disabled={index === total - 1}
              onClick={onNext}
              className={ICON_BUTTON}
            >
              <ChevronDown className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </ChromeTooltip>
          <span className="ml-1 inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[12px] text-[var(--ink-600)]">
              {member.role === "player" ? "Player" : capitalize(member.role)}
            </span>
            <span className="mono tabular text-[11px] text-[var(--ink-400)]">
              {index + 1} / {total}
            </span>
          </span>
          {/* The bridge to the profile page is the NAME, below — not a chip
              up here. Two routes to one page cost this header its last
              breathing room: at 340px the flexible gap had collapsed to its
              8px floor, and "Open profile" was the single widest item in the
              row at 97px. The name is the better of the two anyway — it is
              the record itself, it costs the header nothing, and ⌘-click on
              the roster row already goes to the same place. */}
          <div className="min-w-2 flex-1" />
          {canManage && (
            <MemberMenu
              key={member.playerId}
              member={member}
              isViewer={isViewer}
              onEdit={() => onEdit(member)}
              onError={onError}
              run={run}
              pending={pending}
            />
          )}
          <span aria-hidden className="mx-0.5 h-3.5 w-px bg-[var(--border-medium)]" />
          <ChromeTooltip label="Close" shortcut="Esc">
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={ICON_BUTTON}
            >
              <X className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </ChromeTooltip>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[22px] pt-6 pb-[22px]">
          {/* Identity */}
          {/* `items-start`, not `items-center`: the avatar stays level with
              the first line of a name that runs to two. */}
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden
              className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[14px] font-medium text-[var(--ink-700)]"
            >
              {getInitials(member.name)}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              {/* Ink at rest, blue on hover — the product's link affordance
                  for a record's own name, the same one the roster row uses.

                  It WRAPS rather than truncating. A 340px rail clips plenty
                  of real names at 22px, and the fix for "I cannot read this"
                  is never a tooltip: the design system's own rule is that
                  nothing essential lives only in one, and a person's name in
                  their own drawer is as essential as this panel gets. Two
                  lines cost ~24px of a rail that scrolls anyway. A row in the
                  table is the opposite case — fixed at 52px, it cannot give
                  the height, so there the name truncates and `title` carries
                  the rest. */}
              <h2 className="min-w-0 text-[22px] leading-[1.15] font-light tracking-[-0.2px]">
                <Link
                  href={profile}
                  /* No `title`. The name is fully readable now, and the
                     native tooltip it needed drew in the OS's own style —
                     a pale box here, a dark one there — inches from the
                     header's real dark tooltips. Removing the truncation
                     removed the reason for it. */
                  className="block rounded-[var(--radius-cell)] text-[var(--ink-900)] [text-wrap:balance] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  {member.name}
                </Link>
              </h2>
              <span className="text-[12px] text-[var(--ink-600)]">
                {identityLine(member)}
              </span>
            </div>
          </div>

          {/* One-line stat header over the sparkline */}
          {active && hasStats && (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-[var(--ink-600)]">
                  {active.label}
                  {points.length > 0 && ` · last ${points.length}`}
                </span>
                <span className="inline-flex items-baseline gap-1.5">
                  <span className="tabular text-[16px] text-[var(--ink-900)]">
                    {percent(active.value)}
                  </span>
                  {heroDelta && (
                    <span
                      className="tabular text-[11px] font-medium"
                      style={{ color: heroDelta.color }}
                    >
                      {heroDelta.label}
                    </span>
                  )}
                </span>
              </div>
              <Sparkline label={active.label} points={points} />
              <div className="flex justify-between">
                <span className="mono text-[10px] text-[var(--ink-400)]">
                  {points[0]?.match.date ?? ""}
                </span>
                <span className="mono text-[10px] text-[var(--ink-400)]">
                  {points.length > 1 ? points[points.length - 1].match.date : ""}
                </span>
              </div>
            </div>
          )}

          {/* Four pills that switch the chart — only where there is a chart */}
          {hasStats && (
            <div className="flex flex-wrap gap-1.5 border-t border-[var(--border-hairline)] pt-4">
              {member.measures.map((measure) => (
                <StatPill
                  key={measure.key}
                  measure={measure}
                  selected={measure.key === active?.key}
                  onSelect={() => setActiveKey(measure.key)}
                />
              ))}
            </div>
          )}

          {/* Three recent matches — record rows, chevron, open the match page */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center pb-2">
              <span className="eyebrow-sm flex-1">Recent matches</span>
              {/* "All 0" is a link to nothing. */}
              {member.matchesPlayed > 0 && (
                <Link
                  href={profile}
                  className="text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  All {member.matchesPlayed}
                </Link>
              )}
            </div>
            {member.recent.length === 0 ? (
              /* The one place the drawer says what will arrive — the labels
                 the pills would have carried, in a sentence, since the pills
                 are gone. The button below is the way to make it arrive. */
              <p className="text-[12px] leading-[1.6] text-[var(--ink-500)]">
                No matches yet. Serve and pressure numbers appear here once one
                is analyzed.
              </p>
            ) : (
              member.recent.slice(0, 3).map((match) => (
                <Link
                  key={match.id}
                  href={`/dashboard/matches/${match.id}`}
                  className={`-mx-2 grid h-9 ${RECENT_MATCH_GRID} items-center gap-2.5 rounded-[var(--radius-element)] px-2 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`}
                >
                  {match.won === null ? (
                    <span
                      aria-hidden
                      className="text-center text-[11px] text-[var(--ink-400)]"
                    >
                      –
                    </span>
                  ) : (
                    <ResultMark won={match.won} />
                  )}
                  <span className="truncate text-[12px] text-[var(--ink-900)]">
                    {match.opponent}
                    {match.event ? ` · ${match.event}` : ""}
                  </span>
                  {/* `playedSets` is display-only and belongs here, not in the
                      loader: `matches.score` genuinely stores trailing `0-0`
                      sets and nothing may rewrite them. The track is
                      `minmax(72px,max-content)` so a real three-setter pushes
                      the truncating opponent/event cell instead of being
                      clipped — the score is the column that must stay whole. */}
                  <ScoreLine
                    sets={playedSets(match.sets)}
                    className="text-right text-[11px] whitespace-nowrap text-[var(--ink-600)]"
                  />
                  <span className="mono text-right text-[10px] text-[var(--ink-400)]">
                    {match.date}
                  </span>
                  <ChevronRight
                    className="size-3 text-[var(--ink-300)]"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </Link>
              ))
            )}
          </div>

          <div className="min-h-0 flex-1" />

          {canManage && (
            <div className="flex flex-col gap-3.5">
              <Link
                href="/dashboard/team/upload"
                className={cn(advButton("primary"), "w-full")}
              >
                Upload for {firstName}
              </Link>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
