"use client";

import { resultLabelFromOutcome } from "@/components/dashboard/schedule/result-choice";
import type {
  AdminLineResult,
  AdminResultItemOutcome,
} from "@/lib/admin/results/types";

export function adminResultSummary(result: AdminLineResult) {
  if (result.kind === "outcome")
    return resultLabelFromOutcome({ kind: result.outcome, side: result.side });
  const sets = result.ourGames
    .map(
      (n, i) =>
        `${n}–${result.theirGames[i]}${result.ourTiebreaks[i] !== null && result.ourTiebreaks[i] !== undefined ? ` (${result.ourTiebreaks[i]} our TB)` : result.theirTiebreaks[i] !== null && result.theirTiebreaks[i] !== undefined ? ` (${result.theirTiebreaks[i]} opponent TB)` : ""}`,
    )
    .join(" ");
  return `${sets}${result.ending ? ` · ${result.ending.side === "ours" ? "Our side" : "Opponent"} ${result.ending.kind}` : ""}`;
}
/** Shared submitted-line review and durable status rendering for result entry. */
export function AdminResultReview({
  team,
  event,
  lines,
  statuses = [],
}: {
  team: string;
  event: string;
  lines: {
    id: string;
    label: string;
    players: string;
    opponents: string;
    result: AdminLineResult;
  }[];
  statuses?: AdminResultItemOutcome[];
}) {
  return (
    <section aria-label="Review results" className="flex flex-col gap-4">
      <div>
        <h2 className="text-[16px]">Review results</h2>
        <p className="mt-1 text-[13px] text-[var(--ink-600)]">
          {team} · {event}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {lines.map((line) => {
          const status = statuses.find((s) => s.itemId === line.id);
          return (
            <li
              key={line.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]"
            >
              <span className="w-7 font-medium">{line.label}</span>
              <span className="min-w-[160px] flex-1">
                {line.players || "No player"}
                {line.opponents ? ` vs ${line.opponents}` : ""}
              </span>
              <span className="text-[var(--ink-600)] tabular-nums">
                {adminResultSummary(line.result)}
              </span>
              {status && (
                <span
                  className={
                    status.status === "succeeded"
                      ? "text-[var(--success)]"
                      : "text-[var(--danger)]"
                  }
                >
                  {status.status === "succeeded"
                    ? "Saved"
                    : status.status === "failed"
                      ? `Failed · ${status.error || "Couldn’t save this line"}`
                      : "Not saved yet"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
