"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";
import { useUnseenReportIds } from "@/lib/ui/seen-reports";
import { isAnalysisReady, type AnalysisStatus } from "@/lib/data/match-analysis";

/**
 * The page-level header — title, subline/date row and primary. Round 1's
 * frame-never-moves rule: day zero renders the same bytes as a populated page,
 * only the subline's sentence changes.
 */
export function MatchesTitleRow({
  scope,
  readyMatches,
}: {
  scope: "personal" | "team";
  /** Just enough per match to compute "N analyzed · M new" honestly. */
  readyMatches: { id: string; status?: AnalysisStatus }[];
}) {
  const [dateText, setDateText] = useState("");
  useEffect(() => {
    setDateText(
      new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    );
  }, []);

  const analyzedIds = readyMatches
    .filter((m) => !m.status || isAnalysisReady(m.status))
    .map((m) => m.id);
  const unseen = useUnseenReportIds(analyzedIds);

  const subline =
    analyzedIds.length === 0
      ? scope === "team"
        ? "Nothing recorded yet."
        : "Nothing analyzed yet."
      : `${analyzedIds.length} ${scope === "team" ? "on the program" : "analyzed"}${
          unseen.size > 0 ? ` · ${unseen.size} new` : ""
        }`;

  return (
    <div className="flex items-end gap-4">
      <div>
        <h1 className="text-display">Matches</h1>
        <div className="mt-[9px] flex items-baseline gap-3">
          <span className="text-body-sm">{subline}</span>
          <span className={`text-micro tabular transition-opacity duration-300 ${dateText ? "opacity-100" : "opacity-0"}`}>
            {dateText || " "}
          </span>
        </div>
      </div>
      <div className="flex-1" />
      <Link href="/dashboard/matches/new" className={advButton("primary", "md")}>
        New match
      </Link>
    </div>
  );
}
