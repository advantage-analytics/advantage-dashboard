"use client";

import { useEffect, useState } from "react";

/**
 * The Opponents page header — `MatchesTitleRow`'s composition: the
 * `text-display` h1, then 9px down the `text-body-sm` subline beside the
 * `text-micro` date.
 *
 * No primary. The page's one action is a row click; "New match" belongs to
 * Matches, and nothing on this page creates anything.
 *
 * The date is set after mount, as on Matches: the server's clock is UTC and
 * the reader's is not, so rendering it on the server would print yesterday or
 * tomorrow for part of every day and then correct itself on hydration.
 */
export function OpponentsTitleRow({
  subline,
}: {
  /**
   * The counts under the title, already in words — `personalOpponentsSubline`
   * or `teamOpponentsSubline` (`opponents-views.ts`), over the loader's totals.
   */
  subline: string;
}) {
  const [dateText, setDateText] = useState("");
  useEffect(() => {
    setDateText(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    );
  }, []);

  return (
    <div className="flex items-end gap-2.5">
      <div>
        <h1 className="text-display">Opponents</h1>
        <div className="mt-[9px] flex h-[18px] items-baseline gap-3">
          <span className="text-body-sm tabular">{subline}</span>
          <span
            className={`text-micro tabular transition-opacity duration-300 ${dateText ? "opacity-100" : "opacity-0"}`}
          >
            {dateText || " "}
          </span>
        </div>
      </div>
    </div>
  );
}
