"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, ChevronRight, Search, Square, User } from "lucide-react";
import { formatEventSpan, formatScore, siteLabel } from "@/lib/schedule/format";
import { matchWon } from "@/lib/schedule/entry-state";
import type { UploadQueueGroup } from "@/lib/schedule/types";

const ROW = "grid grid-cols-[18px_40px_1fr_150px_96px] items-center gap-3.5";

/**
 * 22a — which matches did you film.
 *
 * The queue IS the answer to "what needs me": every line in the program with no
 * video, grouped by event, newest first. Ticks cross events on purpose, because
 * a coach uploads a weekend at a time and a Saturday dual and a Sunday
 * tournament are one sitting.
 *
 * This step exists for the day after a weekend. Every "Add video" link on a
 * row skips it entirely — see the pinned path in the flow shell.
 */
export function MatchQueueStep({
  groups,
  selected,
  onToggle,
}: {
  groups: UploadQueueGroup[];
  selected: Set<string>;
  onToggle: (entryId: string) => void;
}) {
  const [term, setTerm] = useState("");

  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) =>
          [
            group.event.name,
            entry.slot ?? "",
            ...entry.playerLabels,
            ...entry.opponentLabels,
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle)
        ),
      }))
      .filter((group) => group.entries.length > 0);
  }, [groups, term]);

  return (
    <div className="flex flex-col gap-[22px]">
      <div>
        <div className="text-title-lg">Which matches did you film?</div>
        <div className="text-body-sm mt-1.5">
          The lineup and your results already created these. Tick what
          you&rsquo;re uploading — one match per video.
        </div>
      </div>

      <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] pb-2 pt-1.5">
        <Search strokeWidth={1.5} className="size-3.5 text-[var(--ink-400)]" />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Find a match, player or event"
          className="w-full bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
        />
      </div>

      {shown.length === 0 ? (
        <p className="text-body-sm">
          {groups.length === 0
            ? "Every line with a result already has video. Record a score on the event first — a line has to have been played before there is a match to film."
            : "Nothing matches that."}
        </p>
      ) : null}

      {shown.map((group) => (
        <div key={group.event.id}>
          <div className="flex items-baseline gap-2.5">
            <span className="eyebrow">
              {group.event.kind === "dual" ? `at ${group.event.name}` : group.event.name}{" "}
              · {group.event.kind} ·{" "}
              {formatEventSpan(group.event.startsOn, group.event.endsOn)} ·{" "}
              {siteLabel(group.event.site)}
            </span>
            <div className="flex-1" />
            <span
              className="text-micro tabular"
              style={{ color: "var(--ink-600)" }}
            >
              {group.withVideo > 0
                ? `${group.withVideo} of ${group.total} have video`
                : `${group.entries.length} without video`}
            </span>
          </div>

          <div className="mt-1.5">
            {group.entries.map((entry, index) => {
              const ticked = selected.has(entry.id);
              const match = entry.matches[0] ?? null;
              const won = match ? matchWon(match) : null;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onToggle(entry.id)}
                  className={`${ROW} w-full cursor-pointer rounded-[var(--radius-cell)] py-3 text-left ${
                    ticked
                      ? "bg-[var(--blue-soft)]"
                      : "hover:bg-[var(--surface-page)]"
                  } ${index > 0 ? "border-t border-[var(--border-hairline)]" : ""}`}
                >
                  {ticked ? (
                    <CheckSquare
                      strokeWidth={1.5}
                      className="ml-0.5 size-[15px] text-[var(--blue)]"
                    />
                  ) : (
                    <Square
                      strokeWidth={1.5}
                      className="ml-0.5 size-[15px] text-[var(--ink-300)]"
                    />
                  )}
                  <span
                    className="mono text-[11px]"
                    style={{ color: "var(--ink-600)" }}
                  >
                    {entry.slot ?? match?.round ?? "—"}
                  </span>
                  <span className="min-w-0 truncate text-[13px] text-[var(--ink-700)]">
                    <span style={{ color: "var(--ink-900)" }}>
                      {entry.playerLabels.join(" / ")}
                    </span>{" "}
                    {won === null ? "vs" : won ? "def." : "lost to"}{" "}
                    {(match?.opponentLabels ?? entry.opponentLabels).join(" / ") ||
                      "—"}
                  </span>
                  {match?.score ? (
                    <span
                      className="tabular text-right text-[13px]"
                      style={{ color: "var(--ink-900)" }}
                    >
                      {formatScore(match.score.player1, match.score.player2)}
                    </span>
                  ) : (
                    <span
                      className="text-micro text-right"
                      style={{ color: "var(--ink-500)" }}
                    >
                      no score yet
                    </span>
                  )}
                  <span />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <Link
        href="/dashboard/matches/new"
        className="flex items-center gap-3 border-t border-[var(--border-hairline)] py-3.5"
      >
        <User strokeWidth={1.5} className="size-3.5 text-[var(--ink-600)]" />
        <span className="flex-1">
          <span className="block text-[13px] text-[var(--ink-900)]">
            Not from an event — single match
          </span>
          <span
            className="text-micro mt-0.5 block"
            style={{ color: "var(--ink-600)" }}
          >
            Challenge, practice or an outside match · you&rsquo;ll fill the
            details yourself
          </span>
        </span>
        <ChevronRight
          strokeWidth={1.5}
          className="size-[13px] text-[var(--ink-400)]"
        />
      </Link>
    </div>
  );
}
