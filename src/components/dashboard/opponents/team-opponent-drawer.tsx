"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { PeekDrawerFrame } from "@/components/dashboard/matches/match-drawer";
import { OpponentTeamField } from "@/components/dashboard/matches/opponent-team-field";
import { ResultMark } from "@/components/dashboard/result-mark";
import { Chip } from "@/components/dashboard/schedule/static/chip";
import { ScoreLine } from "@/components/dashboard/score-line";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import {
  Sparkline,
  StatPill,
  drawerPercent,
  type SparkPoint,
} from "@/components/dashboard/shared/drawer-stat-chart";
import { SortTrigger } from "@/components/dashboard/shared/list-toolbar-trigger";
import { RECENT_MATCH_GRID_WITH_FACE } from "@/components/dashboard/team/player-drawer-layout";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { EmptyMark } from "@/components/ui/empty-mark";
import { ChosenCheck, FloatMenu } from "@/components/ui/float-menu";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { formatDelta, getInitials } from "@/lib/data/match-utils";
import type { PersonalOpponentMeasureKey } from "@/lib/data/personal-opponents";
import type {
  TeamOpponent,
  TeamOpponentFacedBy,
} from "@/lib/data/team-opponents";
import { TEAM_NAV } from "@/lib/dashboard/nav";
import { advButton } from "@/lib/ui/adv-button";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { playedSets } from "@/lib/ui/score-format";
import { cn } from "@/lib/utils";
import {
  applyOpponentTeam,
  describeApplies,
  teamAction,
  teamWriteMode,
  UNATTACHED_CHOICE,
  type TeamChoice,
} from "./add-opponent-team";
import {
  RECENT_ROWS,
  askAboutOpponentHref,
  opponentDrawerFooter,
  opponentFirstName,
  opponentMatchesHref,
  rowDate,
} from "./opponent-drawer-shared";
import { opponentBackhandLabel, opponentHandLabel } from "./opponent-style";
import {
  facedByControl,
  opponentScope,
  opponentTeamLine,
  opponentTeamLineKey,
  recordLabel,
  scopeHasStats,
  scopePlaceholder,
  scopeRecentLabel,
  scopeStatLabel,
} from "./team-opponent-scope";

/** A roster player's 18px face — the chip's, the menu row's and the recent row's. */
const FACE_18 = "size-[18px] text-[8px]";

/**
 * An 11px text action beside a section eyebrow — "Change", "Cancel" — the
 * same geometry as Recent matches' "All 2"; the caller adds the colour.
 */
const TEXT_ACTION_CLS =
  "cursor-pointer rounded-sm text-[11px] font-medium transition-colors duration-[var(--duration-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/**
 * The team Opponents page's 340px peek drawer — one opponent, read from the
 * program's side of the net.
 *
 * The shell is `PeekDrawerFrame`, the rail Matches, Roster, Schedule and the
 * personal Opponents page share: ↑ ↓ stepping, "Opponent n / N", a divider
 * and the close. No ⋯ — an opponent has nothing to edit or remove — so the
 * header holds navigation, position and dismissal only (`reference/tables.md`
 * → Peek Drawer).
 *
 * ── The one thing it writes ─────────────────────────────────────────────────
 * Where they play is its own "Plays for" section. Whoever can write it gets a
 * text action beside the eyebrow — "Add their team" over "No team", "Change"
 * over a team — that turns the row into the wizard's own directory search
 * (`OpponentTeamField`, search-only), with a line under it saying how many
 * matches a pick changes and, for a change, which team it replaces. Staff set
 * it on every match against the opponent; a player on the ones they recorded;
 * a player who recorded none sees "Not set" and no control. Who, how many and
 * both writes are `add-opponent-team.ts` — this file holds no Supabase call. A
 * pick shows at once, the loader's answer replaces it after
 * `router.refresh()`, and a refusal puts the line back with the reason under
 * it.
 *
 * Body, top to bottom: identity (the name, how they play) → **Plays for** →
 * **Faced by** (the team's record is its "All" chip; how many are analyzed
 * sits beside the eyebrow) → the stat block → three recent matches,
 * each led by the face of whoever of ours played it → the pinned footer.
 *
 * ── Faced by is the drawer's one control ────────────────────────────────────
 * "All" is the team's reading and what the drawer opens on. Choosing a roster
 * player narrows the stat header, the sparkline, the four pills and the recent
 * list to that player's own meetings — records the loader already computed
 * (`team-opponent-scope.ts` picks between them; nothing is re-derived here).
 * Up to four players are the page's own chips; past four the chips would wrap
 * to a third line and push the numbers down, so one trigger and the toolbar's
 * menu take over. The choice belongs to the opponent it was made on: stepping
 * ↑↓ to another opponent lands on "All" again, because the player chosen may
 * never have met the next one. Which of the four measures the chart shows is
 * the opposite case and is kept across opponents, so stepping compares them on
 * one figure.
 *
 * ── Nothing here is a tooltip, and nothing truncates that is the record ─────
 * The name and the school line wrap (`items-start` keeps the avatar and the
 * crest level with the first line). A face in a recent row carries its
 * player's name as an accessible label and the same person is a chip or a menu
 * row above it, so no name lives only in a mark.
 *
 * Nothing leads to a coming-soon page: the footer is the personal drawer's
 * rule read against `TEAM_NAV` (`opponentDrawerFooter`).
 */
export function TeamOpponentDrawer({
  opponent,
  index,
  total,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
}: {
  opponent: TeamOpponent;
  /** Position among the rows the table is showing, 0-based. */
  index: number;
  total: number;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  // Which of the four the chart shows — kept while stepping ↑↓.
  const [activeKey, setActiveKey] = useState<PersonalOpponentMeasureKey>(
    opponent.measures[0].key,
  );
  // Who the drawer is narrowed to, tagged with the opponent it was chosen on.
  // A choice made on another opponent reads as "All" — no effect, no flash of
  // the last player's numbers on a stranger's drawer.
  const [choice, setChoice] = useState<{
    opponentKey: string;
    playerId: string | null;
  }>({ opponentKey: opponent.key, playerId: null });
  const chosenId = choice.opponentKey === opponent.key ? choice.playerId : null;
  const choose = (playerId: string | null) =>
    setChoice({ opponentKey: opponent.key, playerId });

  const router = useRouter();
  const workspace = useWorkspace();
  // The team being set, tagged with the opponent it was picked for — the same
  // rule as `choice`, so a pick never shows on the next opponent's drawer.
  const [teamWrite, setTeamWrite] = useState<TeamWrite | null>(null);
  const write = teamWrite?.opponentKey === opponent.key ? teamWrite : null;
  // The "Plays for" search, open for one opponent at a time by the same rule:
  // stepping ↑↓ never carries an open search onto the next drawer.
  const [editing, setEditing] = useState<string | null>(null);
  const editingTeam = editing === opponent.key;
  const teamTriggerRef = useRef<HTMLButtonElement>(null);
  const unattachedRef = useRef<HTMLButtonElement>(null);
  // Set when the search closes by Esc, a pick or Cancel — the input is gone,
  // so focus goes back to Change. Left alone on blur.
  const restoreTeamFocus = useRef(false);
  useEffect(() => {
    if (editingTeam || !restoreTeamFocus.current) return;
    restoreTeamFocus.current = false;
    teamTriggerRef.current?.focus();
  }, [editingTeam]);
  const closeTeamSearch = (restoreFocus: boolean) => {
    restoreTeamFocus.current = restoreFocus;
    setEditing(null);
  };

  const scope = opponentScope(opponent, chosenId);
  const active =
    scope.measures.find((m) => m.key === activeKey) ?? scope.measures[0];
  const hasStats = scopeHasStats(scope);

  // Oldest first — a rivalry reads left to right — and only the meetings that
  // measured this figure; a video still in analysis is a gap, not a zero.
  const points: SparkPoint[] = scope.recent
    .slice()
    .reverse()
    .flatMap((match) => {
      const value = match.values[active.key];
      return value === null || value === undefined
        ? []
        : [
            {
              value,
              match: {
                id: match.id,
                opponent: opponent.name,
                date: match.date
                  ? formatMatchDayShortYear(match.date)
                  : "No date",
              },
            },
          ];
    });
  const heroDelta = active.trend !== null ? formatDelta(active.trend) : null;
  const statLabel = scopeStatLabel(active.label, scope);

  const hand = opponentHandLabel(opponent.hand);
  const backhand = opponentBackhandLabel(opponent.backhand);
  const firstName = opponentFirstName(opponent.name);
  // A pick that is saving or has saved stands in for the loader's answer
  // only while the loader still says what it said before the pick. Once
  // `router.refresh()` brings anything else back, the loader wins — the pick
  // is never kept over the data. One that was refused never stands in.
  const savedTeam = opponentTeamLine(opponent);
  const team =
    write &&
    write.status !== "refused" &&
    opponentTeamLineKey(savedTeam) === write.before
      ? opponentTeamLine({
          ...write.choice,
          unattached: write.choice.source === "unattached",
        })
      : savedTeam;
  // The words the team goes by, for the Change label and the Replaces note.
  const teamName =
    team.kind === "program" || team.kind === "school"
      ? team.name
      : team.kind === "unattached"
        ? "Unattached"
        : null;
  const writeMode = teamWriteMode(
    workspace.active,
    opponent.editableMatchIds.length,
  );
  const action = teamAction(
    writeMode,
    team.kind !== "none",
    opponent.editableMatchIds.length,
    opponent.matchIds.length,
  );

  const pickTeam = async (next: TeamChoice) => {
    if (!writeMode) return;
    const opponentKey = opponent.key;
    const before = opponentTeamLineKey(savedTeam);
    setTeamWrite({
      opponentKey,
      before,
      choice: next,
      status: "saving",
      error: null,
    });
    const result = await applyOpponentTeam({
      mode: writeMode,
      programId: workspace.active.id,
      matchIds: opponent.matchIds,
      editableMatchIds: opponent.editableMatchIds,
      choice: next,
    });
    // Only this pick's own outcome lands: a newer pick, on this opponent or
    // another, is not overwritten by an older one finishing late.
    setTeamWrite((current) =>
      current?.opponentKey === opponentKey && current.choice === next
        ? {
            opponentKey,
            before,
            choice: next,
            status: result.saved > 0 ? "saved" : "refused",
            error: result.error,
          }
        : current,
    );
    // Anything that saved made the Program cell and this line stale.
    if (result.saved > 0) router.refresh();
  };
  const allMatchesHref = opponentMatchesHref(opponent.name);
  const footer = opponentDrawerFooter({
    nav: TEAM_NAV,
    statisticsHref: "/dashboard/team/statistics",
    askHref: "/dashboard/team/ask",
    name: opponent.name,
  });

  const rosterById = new Map(
    opponent.facedBy.map((player) => [player.playerId, player]),
  );

  return (
    <PeekDrawerFrame
      kind="Opponent"
      label={opponent.name}
      index={index}
      total={total}
      canPrev={index > 0}
      canNext={index < total - 1}
      closing={closing}
      autoFocus={autoFocus}
      focusKey={opponent.key}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      footer={
        <>
          {footer.ghost && (
            <Link
              // Into Ask with this opponent already tagged.
              href={askAboutOpponentHref(footer.ghost.href, opponent.name)}
              className={cn(advButton("ghost", "md"), "w-full")}
            >
              {footer.ghost.label}
            </Link>
          )}
          <Link
            href={footer.primary.href}
            className={cn(advButton("primary", "md"), "w-full")}
          >
            {footer.primary.label}
          </Link>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[22px] pt-6 pb-[22px]">
        {/* Identity: who they are, and nothing else. `items-start`, not
            `items-center`: the avatar stays level with the first line of a
            name that runs to two. */}
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[14px] font-medium text-[var(--ink-700)]"
          >
            {getInitials(opponent.name)}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5 pt-1">
            {/* Ink at rest, blue on hover, and it WRAPS — a name in its own
                drawer never truncates (Peek Drawer). */}
            <h2 className="text-title-lg min-w-0">
              <Link
                href={footer.primary.href}
                className="block rounded-[var(--radius-cell)] [text-wrap:balance] text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                {opponent.name}
              </Link>
            </h2>
            {/* "Right-handed · Two-handed backhand". Half recorded keeps the
                one dash for the missing half; nothing recorded is said once,
                in words — "— · —" read as a rendering fault. */}
            <span className="text-[12px] text-[var(--ink-600)]">
              {hand || backhand ? (
                <>
                  {hand ?? <EmptyMark label="Hand not recorded" />}
                  {" · "}
                  {backhand ? (
                    `${backhand} backhand`
                  ) : (
                    <EmptyMark label="Backhand not recorded" />
                  )}
                </>
              ) : (
                "Style not recorded"
              )}
            </span>
          </div>
        </div>

        {/* Plays for — where they play, as its own section under the same
            eyebrow as Faced by and Recent matches, with the one way to set or
            change it beside the eyebrow (as "All 2" sits beside Recent
            matches). Changing turns the row into the picker's search, with
            what a pick will overwrite on the line under it. */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center pb-2">
            <span className="eyebrow-sm flex-1">Plays for</span>
            {action &&
              (editingTeam ? (
                <button
                  type="button"
                  // Keeps focus in the search, so the press closes it here
                  // rather than as the blur that would take focus nowhere.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => closeTeamSearch(true)}
                  className={cn(
                    TEXT_ACTION_CLS,
                    "text-[var(--ink-600)] hover:text-[var(--ink-700)]",
                  )}
                >
                  Cancel
                </button>
              ) : (
                <button
                  ref={teamTriggerRef}
                  type="button"
                  onClick={() => setEditing(opponent.key)}
                  aria-label={
                    teamName
                      ? `Change ${firstName}’s team, ${teamName}`
                      : `Add ${firstName}’s team`
                  }
                  className={cn(
                    TEXT_ACTION_CLS,
                    "text-[var(--blue)] hover:text-[var(--blue-hover)]",
                  )}
                >
                  {action === "add" ? "Add" : "Change"}
                </button>
              ))}
          </div>
          {editingTeam && action && writeMode ? (
            <>
              <OpponentTeamField
                program={opponent.program}
                school={opponent.school}
                searchNote={describeApplies(
                  writeMode,
                  opponent.editableMatchIds.length,
                  opponent.matchIds.length,
                  firstName,
                  // "Replaces Unattached on…" reads as a typo; a first answer
                  // and a change from unattached both just apply.
                  team.kind === "unattached" ? null : teamName,
                )}
                onChange={pickTeam}
                onDismiss={closeTeamSearch}
                // Tab from the search lands on Unattached, not on nothing.
                blurStaysOpen={(next) =>
                  next !== null && next === unattachedRef.current
                }
              />
              {/* No school to search for is one press, not a typed answer.
                  Under the field, so the results menu covers it while
                  somebody is typing a school. */}
              {team.kind !== "unattached" && (
                <button
                  ref={unattachedRef}
                  type="button"
                  // Keeps focus in the search, as Cancel does.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    closeTeamSearch(true);
                    void pickTeam(UNATTACHED_CHOICE);
                  }}
                  // Reached by Tab from the search, so it closes the search
                  // the way the search would: Esc puts focus back on Change,
                  // and leaving for anywhere but the search closes it.
                  onKeyDown={(e) => {
                    if (e.key !== "Escape") return;
                    e.preventDefault();
                    e.stopPropagation();
                    closeTeamSearch(true);
                  }}
                  onBlur={(e) => {
                    const next = e.relatedTarget;
                    if (
                      next instanceof HTMLInputElement &&
                      next.role === "combobox"
                    ) {
                      return;
                    }
                    closeTeamSearch(false);
                  }}
                  className="-mx-2.5 mt-2 flex cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-left transition-colors duration-100 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                >
                  <UnattachedMark size={26} />
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className="text-[12px] text-[var(--ink-900)]">
                      Unattached
                    </span>
                    <span className="text-[11px] text-[var(--ink-600)]">
                      Not with a school or club
                    </span>
                  </span>
                </button>
              )}
            </>
          ) : (
            // A directory program and a school somebody typed are both a team
            // and both get the crest. Unattached is an answer too — a plain
            // tile with a dash, no crest to fake. Only an opponent nobody has
            // placed reads "Not set", over an empty crest outline, with what
            // the answer can be under it for whoever can give it.
            <span className="flex items-center gap-3">
              {team.kind === "none" ? (
                <span
                  aria-hidden
                  className="size-[38px] shrink-0 rounded-[8px] border border-dashed border-[var(--ink-200)]"
                />
              ) : team.kind === "unattached" ? (
                <UnattachedMark size={38} />
              ) : (
                <ProgramCrest
                  name={team.name}
                  crestUrl={team.kind === "program" ? team.crestUrl : null}
                  shortCode={team.kind === "program" ? team.shortCode : null}
                  size={38}
                />
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                {team.kind === "none" ? (
                  <span className="text-[13px] leading-[1.3] text-[var(--ink-600)]">
                    Not set
                  </span>
                ) : (
                  <span className="text-[13px] leading-[1.3] text-[var(--ink-900)]">
                    {teamName}
                  </span>
                )}
                {team.kind === "program" && team.detail ? (
                  <span className="text-[11px] leading-[1.3] text-[var(--ink-600)]">
                    {team.detail}
                  </span>
                ) : null}
                {team.kind === "unattached" ? (
                  <span className="text-[11px] leading-[1.3] text-[var(--ink-600)]">
                    Not with a school or club
                  </span>
                ) : null}
                {team.kind === "none" && action ? (
                  <span className="text-[11px] leading-[1.3] text-[var(--ink-600)]">
                    A school, a club, or unattached
                  </span>
                ) : null}
                {write?.status === "saving" ? (
                  <span
                    role="status"
                    className="text-[11px] leading-[1.3] text-[var(--ink-600)]"
                  >
                    Saving…
                  </span>
                ) : null}
              </span>
            </span>
          )}
          {/* Why a pick did not land, or how much of it did not. */}
          {write?.error ? (
            <span
              role="alert"
              className="tabular pt-1.5 text-[11px] leading-[1.4]"
              style={{ color: "var(--danger-hover)" }}
            >
              {write.error}
            </span>
          ) : null}
        </div>

        {/* Faced by — who of ours has met them, and the drawer's one control.
            The team's record is the "All" chip; how much of it is analyzed
            sits beside the eyebrow. */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center pb-2">
            <span className="eyebrow-sm flex-1">Faced by</span>
            <span className="tabular text-[11px] text-[var(--ink-600)]">
              {opponent.analyzed} of {opponent.played} analyzed
            </span>
          </div>
          {facedByControl(opponent.facedBy.length) === "menu" ? (
            <FacedByMenu
              opponent={opponent}
              chosenId={scope.playerId}
              chosenFirstName={scope.firstName}
              onChoose={choose}
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <Chip
                label="All"
                detail={recordLabel(opponent)}
                // The record line this chip replaced said it in words.
                ariaLabel={`All: the team won ${opponent.wins} and lost ${opponent.losses}`}
                active={scope.playerId === null}
                onClick={() => choose(null)}
              />
              {opponent.facedBy.map((player) => (
                <Chip
                  key={player.playerId}
                  leading={<RosterFace player={player} />}
                  label={player.firstName}
                  detail={recordLabel(player)}
                  active={scope.playerId === player.playerId}
                  onClick={() => choose(player.playerId)}
                />
              ))}
            </div>
          )}
        </div>

        {/* One-line stat header, the sparkline, and the four pills that switch
            it — only where the chosen scope has a figure. */}
        {hasStats && (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-[var(--ink-600)]">
                {statLabel}
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="tabular text-[16px] text-[var(--ink-900)]">
                  {drawerPercent(active.value)}
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
            <Sparkline label={statLabel} points={points} />
            <div className="flex justify-between">
              <span className="mono text-[10px] text-[var(--ink-400)]">
                {points[0]?.match.date ?? ""}
              </span>
              <span className="mono text-[10px] text-[var(--ink-400)]">
                {points.length > 1 ? points[points.length - 1].match.date : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 border-t border-[var(--border-hairline)] pt-4">
              {scope.measures.map((measure) => (
                <StatPill
                  key={measure.key}
                  measure={{ ...measure, pill: measure.label }}
                  selected={measure.key === active.key}
                  onSelect={() => setActiveKey(measure.key)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Three recent matches — record rows, chevron, open the match page —
            each led by the result and then by whoever of ours played it. */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center pb-2">
            <span className="eyebrow-sm flex-1">{scopeRecentLabel(scope)}</span>
            {/* "All 0" is a link to nothing. */}
            {scope.played > 0 && (
              <Link
                href={allMatchesHref}
                className="rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                All {scope.played}
              </Link>
            )}
          </div>
          {scope.recent.slice(0, RECENT_ROWS).map((match) => {
            const sets = playedSets(match.sets);
            const player = rosterById.get(match.rosterPlayerId);
            return (
              <Link
                key={match.id}
                href={`/dashboard/matches/${match.id}`}
                className={cn(
                  "-mx-2 grid h-9 items-center gap-2.5 rounded-[var(--radius-element)] px-2 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  RECENT_MATCH_GRID_WITH_FACE,
                )}
              >
                {match.won === null ? (
                  <span className="inline-flex">
                    <EmptyMark label="No result yet" />
                  </span>
                ) : (
                  <ResultMark won={match.won} />
                )}
                {/* The face is the only place the row says who played, so it
                    carries the name for a reader who cannot see it. */}
                {player ? (
                  <span
                    role="img"
                    aria-label={player.name}
                    className="inline-flex"
                  >
                    <RosterFace player={player} />
                  </span>
                ) : (
                  <span aria-hidden />
                )}
                <span className="truncate text-[12px] text-[var(--ink-900)]">
                  {match.event ?? "Match"}
                </span>
                {sets.length > 0 ? (
                  <ScoreLine
                    sets={sets}
                    className="text-right text-[11px] whitespace-nowrap text-[var(--ink-600)]"
                  />
                ) : (
                  <span className="text-right">
                    <EmptyMark label="No score" />
                  </span>
                )}
                <span className="mono text-right text-[10px] whitespace-nowrap text-[var(--ink-400)]">
                  {match.date ? (
                    rowDate(match.date)
                  ) : (
                    <EmptyMark label="No date" />
                  )}
                </span>
                <ChevronRight
                  className="size-3 text-[var(--ink-300)]"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </Link>
            );
          })}
          {/* The labels the pills would have carried, in a sentence naming
              whose numbers are missing, since the pills are gone. */}
          {!hasStats && (
            <p className="pt-2 text-[12px] leading-[1.6] text-[var(--ink-500)]">
              {scopePlaceholder(scope, firstName)}
            </p>
          )}
        </div>
      </div>
    </PeekDrawerFrame>
  );
}

/** A team pick on its way to the database, and how that went. */
interface TeamWrite {
  /** The opponent the pick was made on. */
  opponentKey: string;
  /** `opponentTeamLineKey` of the loader's team when the pick was made. */
  before: string;
  choice: TeamChoice;
  /** `refused` is nothing saved; `saved` is at least one match changed. */
  status: "saving" | "saved" | "refused";
  /** The sentence to show; null while saving and when every match saved. */
  error: string | null;
}

/**
 * The mark for "Unattached": a plain tile with a short dash — the crest's
 * geometry, so the row lines up with a program's, and nothing that reads as
 * a school.
 */
function UnattachedMark({ size }: { size: 26 | 38 }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-[var(--surface-subtle)]",
        size === 38 ? "size-[38px] rounded-[8px]" : "size-[26px] rounded-[7px]",
      )}
    >
      <span
        className={cn(
          "h-[1.5px] rounded-full bg-[var(--ink-600)]",
          size === 38 ? "w-3" : "w-2.5",
        )}
      />
    </span>
  );
}

/** One roster player's 18px face: their photo, or their initials. */
function RosterFace({
  player,
}: {
  player: Pick<TeamOpponentFacedBy, "name" | "photoUrl">;
}) {
  return (
    <PersonAvatar
      initials={getInitials(player.name)}
      photoUrl={player.photoUrl}
      className={FACE_18}
    />
  );
}

/**
 * Faced by, past four players: the toolbar's own trigger reading "Faced by:
 * All" or the chosen first name, opening the float menu with the same entries
 * the chips would have been — the whole team first, then each player with
 * their face, full name and own record, the blue check on the chosen one.
 *
 * The rows are hand-built on the menu's geometry because `FloatMenuItem` has
 * no slot for a face before the label or a figure after it; the check is
 * still `ChosenCheck`, the one way the product draws "chosen".
 */
function FacedByMenu({
  opponent,
  chosenId,
  chosenFirstName,
  onChoose,
}: {
  opponent: Pick<TeamOpponent, "wins" | "losses" | "facedBy">;
  chosenId: string | null;
  chosenFirstName: string | null;
  onChoose: (playerId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerLabel = `Faced by: ${chosenFirstName ?? "All"}`;
  const pick = (playerId: string | null) => {
    onChoose(playerId);
    setOpen(false);
  };

  return (
    <div className="flex">
      <FloatMenu
        open={open}
        onOpenChange={setOpen}
        align="start"
        width={240}
        sideOffset={6}
        label="Faced by"
        trigger={
          <SortTrigger
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={triggerLabel}
            // Washed while open, and while it holds a narrower reading than
            // the one the drawer opened on.
            engaged={open || chosenId !== null}
            className="cursor-pointer"
          >
            {triggerLabel}
          </SortTrigger>
        }
      >
        <FacedByMenuRow
          name="Whole team"
          record={recordLabel(opponent)}
          chosen={chosenId === null}
          onSelect={() => pick(null)}
        />
        {opponent.facedBy.map((player) => (
          <FacedByMenuRow
            key={player.playerId}
            face={<RosterFace player={player} />}
            name={player.name}
            record={recordLabel(player)}
            chosen={chosenId === player.playerId}
            onSelect={() => pick(player.playerId)}
          />
        ))}
      </FloatMenu>
    </div>
  );
}

function FacedByMenuRow({
  face,
  name,
  record,
  chosen,
  onSelect,
}: {
  face?: React.ReactNode;
  name: string;
  record: string;
  chosen: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={chosen}
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-left transition-colors duration-100 focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
        // No standing fill on the chosen row — the check alone marks it.
        !chosen && "hover:bg-[var(--surface-subtle)]",
      )}
    >
      {face}
      <span className="min-w-0 flex-1 text-[12px] text-[var(--ink-900)]">
        {name}
      </span>
      <span className="tabular shrink-0 text-[11px] text-[var(--ink-500)]">
        {record}
      </span>
      <ChosenCheck chosen={chosen} />
    </button>
  );
}
