"use client";

/**
 * The Details step's opponent menu body and the read-back that replaces the
 * input once someone is named (`/dashboard/matches/new`, step 4,
 * `DetailsStepContent.tsx`). Split out so the section order and the teammate
 * state can be rendered offline; the popover, the input and every pick
 * handler stay in `DetailsStepContent`.
 *
 * Sections, in order:
 *   - a dual: the opponent school's roster (this line's holders, then the
 *     rest), then Teammates;
 *   - otherwise: "People you've played", then Teammates — or Teammates first
 *     when Match type is Practice (`teammatesFirst()` in `teammates.ts`);
 *   - the New opponent row, while the typed term names nobody listed.
 */

import type * as React from "react";
import { Pencil } from "lucide-react";

import { StatePill } from "@/components/ui/state-pill";
import { cn } from "@/lib/utils";
import type { OpponentPlayed, OpponentRosterRow } from "@/lib/wizard/actions";

import { OpponentMenuRow, OpponentNewRow } from "./OpponentMenuRow";
import { TeammatesMenuSection, type RosterMenuPlayer } from "./RosterMenu";
import { floatMenuDividerCls, floatMenuLabelCls } from "./styles";

/** "Aug 22" for a history row. */
export function formatMonthDay(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function rosterMetaVsUs(p: OpponentRosterRow) {
  return (
    <>
      {p.classYear ? `${p.classYear} · ` : ""}
      {p.meetings === 0
        ? "no matches vs us"
        : `${p.meetings} ${p.meetings === 1 ? "match" : "matches"} vs us`}
    </>
  );
}

export function OpponentMenuBody({
  inDual,
  lineSchool,
  lineSlot,
  rosterShown,
  playedShown,
  teammates,
  teammatesFirst,
  chosenTeammateId,
  nameTerm,
  exactKnown,
  onPickRoster,
  onPickPlayed,
  onPickTeammate,
  onCreate,
}: {
  inDual: boolean;
  lineSchool: string | null;
  lineSlot: string | null;
  /** The dual opponent school's roster, already filtered by the term. */
  rosterShown: readonly OpponentRosterRow[];
  /** "People you've played", filtered, capped and without any teammate. */
  playedShown: readonly OpponentPlayed[];
  /** The Teammates section, filtered by the term; null where it never shows. */
  teammates: { label: string; players: readonly RosterMenuPlayer[] } | null;
  teammatesFirst: boolean;
  /** The teammate currently named as the opponent, for the check. */
  chosenTeammateId: string | null;
  /** The typed term, trimmed. */
  nameTerm: string;
  /** Whether the term is exactly someone listed — no New row then. */
  exactKnown: boolean;
  onPickRoster: (row: OpponentRosterRow) => void;
  onPickPlayed: (row: OpponentPlayed) => void;
  onPickTeammate: (row: RosterMenuPlayer) => void;
  onCreate: (name: string) => void;
}) {
  const held = rosterShown.filter((p) => p.heldThisLine);
  const rest = rosterShown.filter((p) => !p.heldThisLine);

  const others = inDual ? (
    <>
      {held.length > 0 && (
        <span className={floatMenuLabelCls} data-menu-section="line-roster">
          {lineSchool}
          {lineSlot ? ` · ${lineSlot} last season` : ""}
        </span>
      )}
      {held.map((p) => (
        <OpponentMenuRow
          key={p.playerId}
          name={p.name}
          onPick={() => onPickRoster(p)}
          meta={rosterMetaVsUs(p)}
        />
      ))}
      {rest.length > 0 && (
        <span className={floatMenuLabelCls} data-menu-section="line-roster">
          {held.length > 0 ? "Rest of their roster" : `${lineSchool}'s roster`}
        </span>
      )}
      {rest.slice(0, 8).map((p) => (
        <OpponentMenuRow
          key={p.playerId}
          name={p.name}
          onPick={() => onPickRoster(p)}
          meta={rosterMetaVsUs(p)}
        />
      ))}
    </>
  ) : (
    <>
      {playedShown.length > 0 && (
        <span className={floatMenuLabelCls} data-menu-section="played">
          People you&apos;ve played
        </span>
      )}
      {playedShown.map((p) => (
        <OpponentMenuRow
          key={p.name}
          name={p.name}
          onPick={() => onPickPlayed(p)}
          meta={
            <>
              {p.matches} {p.matches === 1 ? "match" : "matches"} · Last{" "}
              {formatMonthDay(p.lastDate)}
            </>
          }
        />
      ))}
    </>
  );
  const othersShown = inDual ? rosterShown.length > 0 : playedShown.length > 0;

  const matesShown = (teammates?.players.length ?? 0) > 0;
  const mates =
    teammates && matesShown ? (
      <TeammatesMenuSection
        label={teammates.label}
        players={teammates.players}
        chosenPlayerId={chosenTeammateId}
        onChoose={onPickTeammate}
      />
    ) : null;
  const between =
    matesShown && othersShown ? <span className={floatMenuDividerCls} /> : null;
  const anyShown = othersShown || matesShown;

  return (
    <>
      {teammatesFirst ? (
        <>
          {mates}
          {between}
          {others}
        </>
      ) : (
        <>
          {others}
          {between}
          {mates}
        </>
      )}
      {nameTerm && !exactKnown && (
        <>
          {anyShown && <span className={floatMenuDividerCls} />}
          <OpponentNewRow
            onPick={() => onCreate(nameTerm)}
            label={
              inDual ? (
                <>
                  New player for{" "}
                  <span className="font-medium text-[var(--ink-900)]">
                    {lineSchool}
                  </span>
                </>
              ) : (
                <>
                  New opponent{" "}
                  <span className="font-medium text-[var(--ink-900)]">
                    &ldquo;{nameTerm}&rdquo;
                  </span>
                </>
              )
            }
            hint={inDual ? "name only" : "only you see this name"}
          />
        </>
      )}
      {!nameTerm && !anyShown && (
        <span className={cn(floatMenuLabelCls, "pb-2")}>Type their name.</span>
      )}
    </>
  );
}

/**
 * The opponent, named: the name (click to change it), the provenance micro
 * line, then their team. A teammate's team is this program, so the grey
 * "Teammate" pill stands in the name row instead and no "Add their team" is
 * offered; any other opponent gets `teamField` back.
 */
export function OpponentReadBack({
  name,
  provenance,
  isTeammate,
  teamField,
  onChange,
}: {
  name: string;
  provenance: string | null;
  isTeammate: boolean;
  /** The "their team" field, or null where the workspace never asks it. */
  teamField: React.ReactNode;
  onChange: () => void;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 sm:pt-1.5">
      <span className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onChange}
          aria-label={`Change the opponent, ${name}`}
          className="group inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-left text-[13px] text-[var(--ink-900)]"
        >
          <span className="truncate">{name}</span>
          <Pencil
            className="size-3 shrink-0 text-[var(--ink-400)] transition-colors duration-[var(--duration-hover)] group-hover:text-[var(--ink-700)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
        {isTeammate && <StatePill className="shrink-0">Teammate</StatePill>}
      </span>
      {provenance && (
        <span className="text-micro whitespace-nowrap">{provenance}</span>
      )}
      {!isTeammate && teamField}
    </span>
  );
}
