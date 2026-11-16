"use client";

import { useState } from "react";

/**
 * The Activity log's clamp: the first `limit` rows, then a "Show all" line
 * that draws the rest in place. The rows arrive already rendered by
 * `AdminActivityCard` (a server component), so their labels and dates are
 * formatted once on the server and this file owns nothing but the toggle —
 * no second copy of the row markup, and no server/browser time-zone
 * disagreement over `shortDate()` during hydration.
 *
 * Expanding is one-way: the log is at most the loader's 20 rows, short
 * enough that a "Show less" would only be one more control on a quiet page.
 */
export function AdminActivityShowAll({
  rows,
  limit,
}: {
  rows: readonly React.ReactNode[];
  limit: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const clamped = !expanded && rows.length > limit;

  return (
    <>
      {clamped ? rows.slice(0, limit) : rows}
      {clamped && (
        <div className="border-t border-[var(--border-hairline)] py-[9px]">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            Show all
          </button>
        </div>
      )}
    </>
  );
}
