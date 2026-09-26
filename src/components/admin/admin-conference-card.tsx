"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TEXT_ACTION } from "@/components/admin/admin-people-card";
import { ConferenceMark } from "@/components/admin/conference-mark";
import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { DialogProblem } from "@/components/ui/dialog-problem";
import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";
import { StatePill } from "@/components/ui/state-pill";
import { divisionLongLabel } from "@/lib/data/programs-server";
import {
  addTeamToConference,
  conferenceIdForLabel,
} from "@/lib/services/programs/admin-conference-actions";
import { cn } from "@/lib/utils";
import type {
  AdminTeamConference,
  AdminTeamConferenceTeam,
} from "@/lib/data/admin-team-server";

/** The canvas draws three siblings; the rest are counted, not listed. */
export const CONFERENCE_SIBLINGS_SHOWN = 3;

/**
 * The conference this program plays in, and who else is in it.
 *
 * The rail's third card, under Usage. It answers the question an admin brings
 * to it from a support case — "is anyone else in this league on Advantage?" —
 * with the conference's own counts, and lists the first few siblings so the
 * answer has names attached. Each sibling links to its own admin team page;
 * the full list is the Conferences drawer's, one link away.
 *
 * **`Change` is a `MenuSelect` over `conferenceOptionsFor()`**, the create
 * dialog's own list for the program's division, so both places offer the
 * same conferences. Those options are LABELS (what `programs.conference`
 * mirrors), and `addTeamToConference()` takes an id, so a pick resolves the
 * label first through `conferenceIdForLabel()`. Either step's `{ ok: false }`
 * is printed under the card head — a refused move must not read as a dead
 * control.
 *
 * The trigger is the menu's placeholder, restyled as the card head's blue
 * text action: there is no "current value" to show on it, because the card
 * body already says which conference this is, and the current conference is
 * left out of the menu since picking it would do nothing.
 *
 * `#conference` is the header's `⋯ › Change conference` anchor (T10); the
 * `<section id>` around this card is `page.tsx`'s, not this file's.
 */
export function AdminConferenceCard({
  programId,
  conference,
  currentLabel,
  options,
}: {
  programId: string;
  conference: AdminTeamConference | null;
  /** `programs.conference` — the mirrored label of the current conference. */
  currentLabel: string | null;
  /** `conferenceOptionsFor(division)` — conference labels. */
  options: readonly string[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startMove] = useTransition();

  const choices: MenuOption<string>[] = options
    .filter((label) => label !== currentLabel)
    .map((label) => ({ value: label, label }));

  const move = (label: string) => {
    if (pending) return;
    setError(null);
    startMove(async () => {
      const resolved = await conferenceIdForLabel(label);
      if (!resolved.ok) {
        setError(resolved.error);
        return;
      }
      const result = await addTeamToConference(programId, resolved.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const actionLabel = conference ? "Change" : "Set conference";

  return (
    <SettingsCard className="gap-0 bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          <MenuSelect
            label={conference ? "Change conference" : "Set conference"}
            variant="text"
            value={undefined}
            placeholder={pending ? "Saving…" : actionLabel}
            options={choices}
            onChange={move}
            disabled={pending || choices.length === 0}
            scroll
            width={280}
            // The placeholder span carries the empty-field ink; the head's
            // text action is blue, so the child rule overrides it.
            className={cn(
              TEXT_ACTION,
              "[&>span]:text-[var(--blue)] hover:[&>span]:text-[var(--blue-hover)] [&>svg]:text-[var(--blue)]",
            )}
          />
        }
      >
        Conference
      </SettingsCardTitle>

      {error && (
        <div className="mt-3">
          <DialogProblem message={error} />
        </div>
      )}

      {conference ? (
        <ConferenceBody conference={conference} />
      ) : (
        <p className="mt-3 text-[12px] text-[var(--ink-500)]">
          No conference yet
        </p>
      )}
    </SettingsCard>
  );
}

function ConferenceBody({ conference }: { conference: AdminTeamConference }) {
  const shown = conference.teams.slice(0, CONFERENCE_SIBLINGS_SHOWN);
  const hidden = conference.teams.length - shown.length;

  return (
    <>
      <div className="mt-3 flex min-w-0 items-center gap-3">
        <ConferenceMark
          name={conference.name}
          shortName={conference.shortName}
          size={40}
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
            {conference.name}
          </span>
          <span className="truncate text-[12px] text-[var(--ink-600)] tabular-nums">
            {conferenceMeta(conference)}
          </span>
        </div>
      </div>

      {shown.length > 0 && (
        <ul className="mt-3 flex flex-col">
          {shown.map((team) => (
            <li
              key={team.id}
              className="flex min-h-9 items-center justify-between gap-4 py-1.5"
            >
              <Link
                href={`/admin/teams/${team.id}`}
                className="min-w-0 truncate rounded-[4px] text-[12px] text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-600)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                {team.name}
              </Link>
              <StatePill className="shrink-0">{siblingState(team)}</StatePill>
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <p className="flex items-center gap-2 pt-1.5 text-[12px] whitespace-nowrap text-[var(--ink-600)]">
          <span className="tabular-nums">{hidden} more</span>
          <span className="text-[var(--ink-300)]" aria-hidden>
            ·
          </span>
          <Link
            href={`/admin/conferences?id=${conference.id}`}
            className="rounded-[4px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            View conference
          </Link>
        </p>
      )}
    </>
  );
}

/**
 * `Division I · 16 teams · 1 on Advantage`, skipping the division when the
 * conference has none. Both counts are the loader's, over the whole
 * conference with this program included — see `AdminTeamConference`.
 */
export function conferenceMeta(
  conference: Pick<
    AdminTeamConference,
    "division" | "teamCount" | "onAdvantageCount"
  >,
): string {
  const teams = `${conference.teamCount} ${conference.teamCount === 1 ? "team" : "teams"}`;
  return [
    divisionLongLabel(conference.division),
    teams,
    `${conference.onAdvantageCount} on Advantage`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A sibling's chip. `claimed` is the loader's `on_advantage` predicate
 * (`active` or `claim_pending`); the pending half is named as such, so a
 * claim nobody has approved yet does not read as a live team.
 */
function siblingState(team: AdminTeamConferenceTeam): string {
  if (!team.claimed) return "Unclaimed";
  return team.status === "claim_pending" ? "Claim pending" : "Claimed";
}
