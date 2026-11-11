"use client";

import Link from "next/link";
import { mayRemoveStaffProfile } from "./add-self-dialog";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { PROGRAM_ROLE_LABEL, canUploadForProgram } from "@/lib/workspace/types";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AdvSwitch } from "@/components/ui/adv-switch";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  DRAWER_RAIL,
  DrawerScrim,
} from "@/components/dashboard/shared/drawer-sheet";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { playedSets } from "@/lib/ui/score-format";
import { RECENT_MATCH_GRID } from "@/components/dashboard/team/player-drawer-layout";
import { advButton } from "@/lib/ui/adv-button";
import { capitalize, cn } from "@/lib/utils";
import { formatDelta } from "@/lib/data/match-utils";
import { PlayerIdentity } from "@/components/dashboard/team/player-identity";
import { opponentPlaysLabel } from "@/components/dashboard/opponents/opponent-style";
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
import { useClaimInvite } from "@/components/dashboard/team/roster-claim-invite";
import type { RosterMember } from "@/lib/data/team-roster-server";
import {
  MeasureSelector,
  Sparkline,
  type SparkPoint,
} from "@/components/dashboard/shared/drawer-stat-chart";

/**
 * The roster's 340px player drawer — Platform Audit `Tb4`, spec'd in Updated
 * Design System `20a`/`20c`/`20f`.
 *
 * "Row distilled to what you compare, drawer keeps what you read." Identity
 * (`PlayerIdentity`, the profile rail's block: name, facts, Record + form,
 * Plays) → the four measures as a selector, each with its figure → a
 * one-line stat header over a six-match sparkline (hover any match for
 * value, opponent and date) — both only where a figure exists, see
 * `hasStats` → four recent matches → full-width Upload. Header controls
 * inset 20px to match the page header; ‹ › step players, and the name below
 * bridges to the page.
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
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 touch:hit-area";

/**
 * The leading glyph on each Options-menu row: neutral ink-400 — never `--blue`
 * (`FloatMenuItem`'s default). Shared by all three rows so a later tweak to
 * size, colour or stroke weight is one edit. The Remove row adds
 * `group-hover`/`group-focus-visible` danger, so its label and icon turn red
 * together at the moment of intent (DS › Dropdown / Menu).
 */
const MENU_ROW_ICON = "size-[13px] shrink-0 text-[var(--ink-400)]";

/** Recent matches the drawer lists; "All N" opens the rest on the profile. */
const RECENT_ROWS = 4;

/** The drawer's `role="dialog"` carries this so the window key handler can tell it from a modal. */
export const DRAWER_ATTR = "data-roster-drawer";

/**
 * "Junior · Singles 2" — the facts under the name, in the profile rail's
 * order and wording so the two blocks read alike. Staff get their role; a
 * player with neither fact gets their address, and "On the roster" is the
 * floor. Handedness is not here: it is the block's own Plays row.
 */
function identityFacts(member: RosterMember): string[] {
  if (member.role !== "player") return [capitalize(member.role)];
  const parts: string[] = [];
  if (member.classYear) parts.push(member.classYear);
  if (member.lineupSpot !== null) parts.push(`Singles ${member.lineupSpot}`);
  if (parts.length > 0) return parts;
  return [member.email ?? "On the roster"];
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
  // Nor on a player row held by somebody who is ALSO staff: their sending is
  // decided by the upload policy, exactly as on their staff row.
  const playerOnly = member.role === "player" && member.staffRole === null;
  const canToggleSend = member.userId !== null && playerOnly;
  // Nobody removes themselves from the team here — except from a player row
  // that sits beside a staff seat. Removing that one only takes them off the
  // roster (`archive_program_player` keeps a staff member's membership), so it
  // is offered on the viewer's own row too: it is how "add yourself as a
  // player" is undone.
  //
  // Who may remove a staff-held profile mirrors `archive_program_player`: the
  // person themselves, the owner, or a coach acting on a staff member's.
  // Presentation only — the function refuses the rest.
  const { active } = useWorkspace();
  const canRemove =
    member.staffRole !== null
      ? mayRemoveStaffProfile(active.role, member.staffRole, isViewer)
      : member.role !== "owner" && !isViewer;
  // Gated on there being a profile row to write. A coach and a claimed player
  // both have one; staff seats do not.
  const canEdit = member.profileId !== null;
  const grantSlotFilled = playerOnly;

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
            <span className="flex min-w-0 flex-1 items-start gap-2.5">
              <Upload
                className={`mt-0.5 ${MENU_ROW_ICON}`}
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium text-[var(--ink-900)]">
                  Can send video
                </span>
                <span className="block text-[11px] leading-[1.5] text-[var(--ink-500)]">
                  Spends the program&apos;s analysis time
                </span>
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
                    next,
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
          playerOnly && (
            <p className="px-2 py-2 text-[11px] leading-[1.5] text-[var(--ink-500)]">
              No login yet, so there is no analysis time to grant.
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
            className="flex w-full items-center gap-2.5 rounded-[var(--radius-element)] px-2 py-2 text-left text-[12px] text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
          >
            <Pencil className={MENU_ROW_ICON} strokeWidth={1.5} aria-hidden />
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
                  : removeMember(member.userId as string),
              )
            }
            className="group flex w-full items-start gap-2.5 rounded-[var(--radius-element)] px-2 py-2 text-left transition-colors hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none disabled:opacity-50"
          >
            <Trash2
              className={`mt-0.5 ${MENU_ROW_ICON} transition-colors group-hover:text-[var(--danger)] group-focus-visible:text-[var(--danger)]`}
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-[var(--ink-700)] group-hover:text-[var(--danger)] group-focus-visible:text-[var(--danger)]">
                Remove from roster
              </span>
              {member.profileId && (
                <span className="block text-[11px] leading-[1.5] text-[var(--ink-500)]">
                  {member.staffRole !== null
                    ? `Only ${isViewer ? "your" : "the"} player profile goes. ${isViewer ? "Your" : "Their"} ${PROGRAM_ROLE_LABEL[member.staffRole].toLowerCase()} role and ${isViewer ? "your" : "their"} matches stay.`
                    : "Their matches stay. Adding them again offers to restore this profile."}
                </span>
              )}
            </span>
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
  const { active: workspace } = useWorkspace();
  const canUpload = canUploadForProgram(workspace);
  const claimInvite = useClaimInvite();
  // `profileId` is what an invitation targets; a coach-managed row always has
  // one, and holding it here (rather than a boolean plus a cast at the click
  // site) is what keeps that guarantee honest.
  const claimProfileId =
    member.role === "player" && member.managedBy === "coach"
      ? member.profileId
      : null;
  const coachManaged = claimProfileId !== null;
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
          return value === null || value === undefined
            ? []
            : [{ value, match }];
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
    <>
      <DrawerScrim closing={closing} onClose={onClose} />
      <aside
        {...{ [DRAWER_ATTR]: "" }}
        onAnimationEnd={(event) => {
          if (event.animationName === "roster-drawer-out") onClosed();
        }}
        className={cn(
          DRAWER_RAIL,
          closing
            ? "w-0 animate-[roster-drawer-out_200ms_var(--ease-primary)_both]"
            : "w-[340px] animate-[roster-drawer-in_200ms_var(--ease-primary)_both]",
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
                <ChevronDown
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden
                />
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
            <span
              aria-hidden
              className="mx-0.5 h-3.5 w-px bg-[var(--border-medium)]"
            />
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
            {/* Identity — the profile rail's block (`PlayerIdentity`), so a
              player reads the same here and on their page. The name links to
              the profile, ink at rest and blue on hover, and wraps rather
              than truncating; Coach-managed is the glyph after it. */}
            <PlayerIdentity
              name={member.name}
              href={profile}
              photoUrl={member.avatarUrl}
              facts={identityFacts(member)}
              coachManaged={coachManaged}
              markAlign="end"
              wins={member.wins}
              losses={member.losses}
              form={member.form}
              plays={
                member.role === "player"
                  ? opponentPlaysLabel(member.hand, member.backhand)
                  : null
              }
            />

            {/* The one thing to do about a coach-managed profile. What the
              state MEANS is the glyph's tooltip, for everyone; this well is
              what follows from it, for staff only — a teammate can do nothing
              with it — so the two never say the same sentence. A well inset
              in a card is what `--surface-page` is for. */}
            {coachManaged && canManage && (
              <div className="flex flex-col items-start gap-2 rounded-[var(--radius-element)] bg-[var(--surface-page)] px-3.5 py-3">
                <p className="text-[11px] leading-[1.6] text-[var(--ink-700)]">
                  Invite {firstName} to claim this profile. Every match stays,
                  and no new seat is used.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    claimProfileId && claimInvite.request(claimProfileId)
                  }
                  className="cursor-pointer rounded-[var(--radius-cell)] text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  Invite to claim →
                </button>
              </div>
            )}

            {/* The trend, as one group: the four measures as a selector ABOVE
              the chart they switch, each with its figure, so the choice comes
              before the reading; then the chart. The selected figure is said
              once, in the selector — the chart's header carries only what the
              selector does not: the full label, the window, the change. The
              per-match dates are the chart's hover and the list below, so no
              date row. Only where there is a chart. */}
            {active && hasStats && (
              <div className="flex flex-col gap-3">
                <MeasureSelector
                  measures={member.measures}
                  activeKey={active.key}
                  onSelect={setActiveKey}
                />
                <div className="flex flex-col gap-2.5 pt-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] text-[var(--ink-600)]">
                      {active.label}
                      {points.length > 0 && ` · Last ${points.length}`}
                    </span>
                    {heroDelta && (
                      <span
                        className="tabular text-[11px] font-medium"
                        style={{ color: heroDelta.color }}
                      >
                        {heroDelta.label}
                      </span>
                    )}
                  </div>
                  <Sparkline label={active.label} points={points} />
                </div>
              </div>
            )}

            {/* Recent matches — record rows, chevron, open the match page */}
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
                  No matches yet. Serve and pressure numbers appear here once
                  one is analyzed.
                </p>
              ) : (
                member.recent.slice(0, RECENT_ROWS).map((match) => (
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
                    </span>
                    {/* `playedSets` is display-only and belongs here, not in the
                      loader: `matches.score` genuinely stores trailing `0-0`
                      sets and nothing may rewrite them. The track is
                      `minmax(72px,max-content)` so a real three-setter pushes
                      the truncating opponent cell instead of being
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
          </div>
          {/* One button. The name and "All N" already open the profile, so
            "Open profile" stands in only for a viewer who cannot upload —
            the footer is never empty, and never holds two. */}
          <div className="flex shrink-0 flex-col gap-3 px-[22px] py-4">
            {canUpload ? (
              <Link
                href={`/dashboard/matches/new?player=${member.playerId}`}
                className={cn(advButton("primary"), "w-full")}
              >
                Upload for {firstName}
              </Link>
            ) : (
              <Link href={profile} className={cn(advButton("ghost"), "w-full")}>
                Open profile
              </Link>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
