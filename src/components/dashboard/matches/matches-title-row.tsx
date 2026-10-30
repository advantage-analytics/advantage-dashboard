"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PendingBar } from "@/components/dashboard/loading/pending";
import { advButton } from "@/lib/ui/adv-button";
import { useUnseenReportIds } from "@/lib/ui/seen-reports";
import {
  isAnalysisReady,
  type AnalysisStatus,
} from "@/lib/data/match-analysis";

/**
 * The page-level header — title, subline/date row and primary. Round 1's
 * frame-never-moves rule: day zero renders the same bytes as a populated page,
 * only the subline's sentence changes.
 */
export function MatchesTitleRow({
  scope,
  readyMatches,
  canUpload = true,
}: {
  scope: "personal" | "team";
  /** Just enough per match to compute "N analyzed · M new" honestly. */
  canUpload?: boolean;
  readyMatches?: { id: string; status?: AnalysisStatus }[];
}) {
  const [dateText, setDateText] = useState("");
  useEffect(() => {
    setDateText(
      // "Monday, Aug 24" — the frame's short month (Platform Audit Pb2).
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    );
  }, []);

  const analyzedIds = (readyMatches ?? [])
    .filter((m) => !m.status || isAnalysisReady(m.status))
    .map((m) => m.id);
  const unseen = useUnseenReportIds(analyzedIds);

  // A team's line counts what the program has recorded, so a match still in
  // analysis or one that failed counts. A personal line counts what is analyzed.
  const count =
    scope === "team" ? (readyMatches ?? []).length : analyzedIds.length;
  const subline =
    count === 0
      ? scope === "team"
        ? "Nothing recorded yet."
        : "Nothing analyzed yet."
      : `${count} ${scope === "team" ? "on the program" : "analyzed"}${
          unseen.size > 0 ? ` · ${unseen.size} new` : ""
        }`;

  return (
    <div className="flex items-end gap-2.5">
      <div>
        <h1 className="text-display">Matches</h1>
        <div className="mt-[9px] flex h-[18px] items-baseline gap-3">
          {readyMatches ? (
            <span className="text-body-sm">{subline}</span>
          ) : (
            <span role="status" aria-label="Loading match summary">
              <PendingBar className="h-3 w-40 rounded" />
            </span>
          )}
          <span
            className={`text-micro tabular transition-opacity duration-300 ${dateText ? "opacity-100" : "opacity-0"}`}
          >
            {dateText || " "}
          </span>
        </div>
      </div>
      <div className="flex-1" />
      {canUpload && (
        <Link
          href="/dashboard/matches/new"
          className={advButton("primary", "md")}
        >
          New match
        </Link>
      )}
    </div>
  );
}
