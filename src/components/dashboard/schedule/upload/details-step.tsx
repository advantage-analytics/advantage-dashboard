"use client";

import { CheckCircle, CheckSquare, Circle, Square } from "lucide-react";
import { formatEventDay, formatScore, siteLabel } from "@/lib/schedule/format";
import {
  formatClock,
  type AttachedFile,
  type LineAnswers,
  type SelectedEntry,
} from "@/components/dashboard/schedule/upload/types";

/**
 * 22d — what the lineup can't know.
 *
 * Everything else came from the event, and a wrong fact is edited there rather
 * than re-typed here. What is left is exactly three things:
 *
 *   - the camera, ONCE per batch, because a dual is filmed from one setup;
 *   - which end our player started, PER video, because ends are decided at the
 *     toss;
 *   - a score, only for a line whose match does not have one.
 */
export function DetailsStep({
  selected,
  files,
  answers,
  fixedCamera,
  onFixedCamera,
  onAnswer,
}: {
  selected: SelectedEntry[];
  files: Record<string, AttachedFile>;
  answers: Record<string, LineAnswers>;
  fixedCamera: boolean | null;
  onFixedCamera: (value: boolean) => void;
  onAnswer: (entryId: string, patch: Partial<LineAnswers>) => void;
}) {
  const videos = selected.filter(({ entry }) => files[entry.id]?.kind === "video");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-title-lg">What the lineup can&rsquo;t know</div>
        <div className="text-body-sm mt-1.5">
          Everything else came from the event. Wrong facts are edited there, not
          re-typed here.
        </div>
      </div>

      {videos.length > 0 ? (
        <button
          type="button"
          onClick={() => onFixedCamera(!fixedCamera)}
          className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-[11px] text-left"
        >
          {fixedCamera ? (
            <CheckSquare strokeWidth={1.5} className="size-3.5 text-[var(--blue)]" />
          ) : (
            <Square strokeWidth={1.5} className="size-3.5 text-[var(--ink-300)]" />
          )}
          <span className="text-[12px]" style={{ color: "var(--ink-700)" }}>
            Same camera for all {videos.length} —{" "}
            <span style={{ color: "var(--ink-900)" }}>
              fixed position, back of court
            </span>
          </span>
        </button>
      ) : null}

      {videos.map(({ entry, event }) => {
        const attached = files[entry.id];
        const line = answers[entry.id];
        const match = entry.matches[0] ?? null;
        const hasScore = Boolean(match?.score?.player1?.length);
        const ourName = entry.playerLabels[0] ?? "Our player";
        const window =
          attached?.kind === "video"
            ? `${formatClock(attached.startSeconds)} – ${formatClock(attached.endSeconds)}`
            : "";

        return (
          <div
            key={entry.id}
            className={`flex flex-col gap-3 rounded-[10px] border border-[var(--border-hairline)] px-[18px] py-4 ${
              hasScore ? "" : "shadow-[var(--shadow-card)]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="mono text-[11px]" style={{ color: "var(--ink-600)" }}>
                {entry.slot ?? match?.round ?? "—"}
              </span>
              <span className="text-[14px] text-[var(--ink-900)]">
                {entry.playerLabels.join(" / ")}{" "}
                <span style={{ color: "var(--ink-600)" }}>vs</span>{" "}
                {(match?.opponentLabels ?? entry.opponentLabels).join(" / ") || "—"}
              </span>
              <div className="flex-1" />
              {hasScore ? (
                <>
                  <span
                    className="tabular text-[13px]"
                    style={{ color: "var(--ink-900)" }}
                  >
                    {formatScore(match?.score?.player1, match?.score?.player2)}
                  </span>
                  <span className="text-micro" style={{ color: "var(--ink-500)" }}>
                    entered courtside
                  </span>
                </>
              ) : (
                <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
                  Score wasn&rsquo;t entered courtside — the report needs it
                </span>
              )}
            </div>

            {hasScore ? null : (
              <ScoreRow
                ourName={ourName}
                line={line}
                onChange={(patch) => onAnswer(entry.id, patch)}
              />
            )}

            <div
              className="text-micro tabular"
              style={{ color: "var(--ink-600)" }}
            >
              {formatEventDay(event.startsOn)} · {siteLabel(event.site)} ·{" "}
              {event.surface ?? "—"} · best of {event.format.bestOf},{" "}
              {event.format.adScoring === null
                ? "scoring unset"
                : event.format.adScoring
                  ? "ad"
                  : "no-ad"}
              {window ? ` · window ${window}` : ""}
            </div>

            <div className="flex items-center gap-5 border-t border-[var(--border-hairline)] pt-3">
              <span className="eyebrow">{ourName} starts</span>
              <EndChoice
                chosen={line?.startsTop === true}
                label="Top of frame"
                onPick={() => onAnswer(entry.id, { startsTop: true })}
              />
              <EndChoice
                chosen={line?.startsTop === false}
                label="Bottom"
                onPick={() => onAnswer(entry.id, { startsTop: false })}
              />
              <span className="text-micro" style={{ color: "var(--ink-500)" }}>
                at the first frame — the far side from the camera is the top
              </span>
            </div>
          </div>
        );
      })}

      {videos.length === 0 ? (
        <p className="text-body-sm">
          Nothing to ask — a SwingVision export already carries its numbers, and
          the camera questions belong to video.
        </p>
      ) : null}
    </div>
  );
}

function EndChoice({
  chosen,
  label,
  onPick,
}: {
  chosen: boolean;
  label: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="inline-flex cursor-pointer items-center gap-1.5"
    >
      {chosen ? (
        <CheckCircle strokeWidth={1.5} className="size-3.5 text-[var(--blue)]" />
      ) : (
        <Circle strokeWidth={1.5} className="size-3.5 text-[var(--ink-300)]" />
      )}
      <span
        className="text-[12px]"
        style={{ color: chosen ? "var(--ink-900)" : "var(--ink-700)" }}
      >
        {label}
      </span>
    </button>
  );
}

function ScoreRow({
  ourName,
  line,
  onChange,
}: {
  ourName: string;
  line: LineAnswers | undefined;
  onChange: (patch: Partial<LineAnswers>) => void;
}) {
  const ourGames = line?.ourGames ?? ["", "", ""];
  const theirGames = line?.theirGames ?? ["", "", ""];
  const ourTiebreaks = line?.ourTiebreaks ?? ["", "", ""];
  const theirTiebreaks = line?.theirTiebreaks ?? ["", "", ""];

  function replace(list: string[], index: number, value: string) {
    const next = [...list];
    next[index] = value.replace(/[^0-9]/g, "");
    return next;
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="eyebrow">Score</span>
      <div className="flex items-center gap-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex gap-1">
            <Cell
              value={ourGames[index]}
              onChange={(value) =>
                onChange({ ourGames: replace(ourGames, index, value) })
              }
            />
            <Cell
              value={theirGames[index]}
              onChange={(value) =>
                onChange({ theirGames: replace(theirGames, index, value) })
              }
            />
            <Cell
              small
              value={ourTiebreaks[index] || theirTiebreaks[index]}
              onChange={(value) => {
                // The set winner took the breaker 7-x, so the number belongs to
                // whoever lost the set.
                const ours = Number(ourGames[index] || 0);
                const theirs = Number(theirGames[index] || 0);
                if (ours > theirs) {
                  onChange({
                    theirTiebreaks: replace(theirTiebreaks, index, value),
                    ourTiebreaks: replace(ourTiebreaks, index, ""),
                  });
                } else {
                  onChange({
                    ourTiebreaks: replace(ourTiebreaks, index, value),
                    theirTiebreaks: replace(theirTiebreaks, index, ""),
                  });
                }
              }}
            />
          </div>
        ))}
      </div>
      <span className="text-micro" style={{ color: "var(--ink-500)" }}>
        {ourName}&rsquo;s games first · tiebreak in the small cell
      </span>
    </div>
  );
}

function Cell({
  value,
  onChange,
  small,
}: {
  value: string;
  onChange: (value: string) => void;
  small?: boolean;
}) {
  return (
    <input
      value={value}
      inputMode="numeric"
      maxLength={2}
      placeholder={small ? "" : "–"}
      aria-label={small ? "Tiebreak points for the side that lost it" : "Games"}
      onChange={(event) => onChange(event.target.value)}
      className={`tabular h-[30px] w-[26px] rounded-[6px] border border-[#EAECF0] bg-white text-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)] ${
        small ? "text-[11px] text-[#525252]" : "text-[13px] text-[#0D0D0D] placeholder:text-[#CCCCCC]"
      }`}
    />
  );
}
