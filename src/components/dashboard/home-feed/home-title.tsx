import type { ReactNode } from "react";
import type { HomeFeed } from "@/lib/data/home-feed-server";

const count = (n: number, one: string, many: string) =>
  `${n === 1 ? one : many}`;

/**
 * Both Homes' title row: the greeting, one line on where the matches stand,
 * and the page's primary action.
 *
 * The line is the newest fact first — what is still analyzing, or how many
 * reports exist once nothing is — then the recent record. A workspace with no
 * match reads `emptyLine` instead.
 */
export function HomeTitle({
  greeting,
  firstName,
  feed,
  emptyLine,
  label,
  action,
}: {
  greeting: string;
  firstName: string | null;
  feed: Pick<HomeFeed, "analyzing" | "analyzed" | "lastFive" | "matchCount">;
  emptyLine: string;
  /** The region's accessible name: "Team home" or "Home". */
  label: string;
  action?: ReactNode;
}) {
  const { analyzing, analyzed, lastFive, matchCount } = feed;
  const status =
    analyzing > 0
      ? {
          n: analyzing,
          word: count(analyzing, "match", "matches") + " analyzing",
        }
      : analyzed > 0
        ? {
            n: analyzed,
            word: count(analyzed, "match", "matches") + " analyzed",
          }
        : null;
  const record =
    lastFive.played > 0 ? `${lastFive.wins}–${lastFive.losses}` : null;

  return (
    <section
      aria-label={label}
      className="flex items-center justify-between gap-6"
    >
      <div className="min-w-0">
        <h1 className="text-title-lg">
          {firstName ? `${greeting}, ${firstName}` : greeting}
        </h1>
        <p className="mt-1 flex items-center gap-2 text-[12px] leading-5 whitespace-nowrap text-[var(--ink-600)]">
          {matchCount === 0 ? (
            emptyLine
          ) : (
            <>
              {status && (
                <span>
                  <b className="tabular font-normal text-[var(--ink-900)]">
                    {status.n}
                  </b>{" "}
                  {status.word}
                </span>
              )}
              {status && record && (
                <span aria-hidden className="text-[var(--ink-400)]">
                  ·
                </span>
              )}
              {record && (
                <span>
                  <b className="tabular font-normal text-[var(--ink-900)]">
                    {record}
                  </b>
                  {lastFive.played >= 5 ? " in the last five matches" : ""}
                </span>
              )}
              {/* Matches that carry neither a status nor a result (practice
                  only) still get a true line rather than a blank one. */}
              {!status && !record && (
                <span>
                  <b className="tabular font-normal text-[var(--ink-900)]">
                    {matchCount}
                  </b>{" "}
                  {count(matchCount, "match", "matches")}
                </span>
              )}
            </>
          )}
        </p>
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </section>
  );
}

/** A section's heading row: the eyebrow, then its quiet links on the right. */
export function SectionHead({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-4 items-center justify-between gap-3 px-0.5">
      <h2 className="eyebrow">{title}</h2>
      {children ? (
        <div className="flex min-w-0 items-center gap-4">{children}</div>
      ) : null}
    </div>
  );
}

/** The 11px blue link a section heading carries. */
export const HEAD_LINK =
  "rounded-[var(--radius-cell)] text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/** The band under an empty table's ghost rows: what goes here, and how. */
export function EmptyBand({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-3.5 border-t border-[var(--border-hairline)] pt-4 pb-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="text-[13px] font-medium text-[var(--ink-900)]">{title}</b>
        <span className="text-[12px] leading-normal text-[var(--ink-600)]">
          {body}
        </span>
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

/** One grey bar of a ghost row. */
export function GhostBar({ width, round }: { width: number; round?: boolean }) {
  return (
    <span
      className="block bg-[var(--ink-100)]"
      style={{
        width,
        height: round ? width : 8,
        borderRadius: round ? "50%" : 4,
      }}
    />
  );
}
