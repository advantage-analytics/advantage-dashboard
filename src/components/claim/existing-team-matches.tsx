import type { CustomProgramSearchResult } from "@/lib/data/programs-server";
import type { CustomOrgType } from "@/lib/services/programs/create-actions";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The eyebrow, title and placeholder for each org type chosen on 7.1.
 *
 * Lives here rather than in `team-setup-form.tsx` so this leaf can read the
 * eyebrow as a row's type label without importing the form — which pulls in a
 * server action and would stop the offline spec from loading the list with
 * nothing but `react`. The form imports it from here.
 */
export const TYPE_LABEL: Record<
  CustomOrgType,
  { eyebrow: string; title: string; placeholder: string }
> = {
  club: {
    eyebrow: "Tennis club",
    title: "Set up your club team",
    placeholder: "Riverside Tennis Club — Juniors",
  },
  high_school: {
    eyebrow: "High school",
    title: "Set up your high school team",
    placeholder: "Riverside High — Varsity",
  },
  academy: {
    eyebrow: "Academy",
    title: "Set up your academy team",
    placeholder: "Baseline Academy — Performance Group",
  },
  other: {
    eyebrow: "Something else",
    title: "Set up your team",
    placeholder: "Your team's name",
  },
};

/**
 * The same instruction `reasonMessage("limit-reached")` gives a coach at the
 * team limit — ask the owner — offered here before they ever create a copy.
 */
export const EXISTING_TEAM_NOTE =
  "Already on Advantage. If this is your team, ask its owner to add you instead of creating another.";

/** An exact case-insensitive name match first; the endpoint's order otherwise. */
export function orderMatches(
  rows: CustomProgramSearchResult[],
  term: string,
): CustomProgramSearchResult[] {
  const needle = term.trim().toLowerCase();
  const exact = rows.filter((r) => r.name.trim().toLowerCase() === needle);
  if (exact.length === 0) return rows;
  return [...exact, ...rows.filter((r) => !exact.includes(r))];
}

/**
 * Existing custom teams whose name matches what the coach is typing on 7.2.
 *
 * Creating a same-named team stays permitted; the list is there so a coach
 * whose team already exists can ask to join it instead. The ask is a prop,
 * not an import: `onAskToJoin` is the form's server-action call, and taking
 * it as a callback is what keeps this leaf free of `next/*` and server
 * modules, so the offline spec can render it with nothing but `react`.
 * Without the prop the rows are the informational list T2 shipped. No rows
 * renders nothing — not even "Nothing matched", because an empty result is
 * the normal case on this screen, not a failed search.
 *
 * The button is the design system's `outline` at `sm`, not a primary: the
 * screen's one primary is Continue, and asking to join is the alternative
 * to it, not a second call to action. While one row's ask is in flight every
 * row's button is disabled — one request at a time is the only honest state
 * for a form that redirects on success.
 */
export function ExistingTeamMatches({
  rows,
  term,
  onAskToJoin,
  pendingProgramId = null,
}: {
  rows: CustomProgramSearchResult[];
  term: string;
  /** Files a join request for the row's program. Absent = list only. */
  onAskToJoin?: (programId: string) => void;
  /** The row whose ask is in flight, or null. */
  pendingProgramId?: string | null;
}) {
  if (rows.length === 0) return null;
  const ordered = orderMatches(rows, term).slice(0, 8);
  const busy = pendingProgramId !== null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-body-sm">{EXISTING_TEAM_NOTE}</p>
      <ul className="overflow-hidden rounded-[var(--radius-element)] border border-[var(--border-medium)] bg-[var(--surface-card)]">
        {ordered.map((row) => (
          <li
            key={row.programId}
            className={`grid items-center gap-4 border-t border-[var(--border-hairline)] px-4 py-3 first:border-t-0 ${
              onAskToJoin
                ? "grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                : "grid-cols-[minmax(0,1fr)_auto_auto]"
            }`}
          >
            <span className="truncate text-[13px] text-[var(--ink-900)]">
              {row.name}
            </span>
            <span className="text-body-sm">
              {TYPE_LABEL[row.orgType]?.eyebrow ?? ""}
            </span>
            <span className="text-micro truncate text-right">
              {row.ownerDisplay ?? "Set up"}
            </span>
            {onAskToJoin && (
              <button
                type="button"
                onClick={() => onAskToJoin(row.programId)}
                disabled={busy}
                aria-label={`Ask to join ${row.name}`}
                className={advButton("outline", "sm")}
              >
                {pendingProgramId === row.programId ? "Asking…" : "Ask to join"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
