import type { ReactNode } from "react";
import Link from "next/link";
import { CourtArt } from "./court-art";
import type { Cut, VizDot } from "./viz-model";

/**
 * The wall/band card: art on top, a dark player-name chip over it, then a
 * label block (view name, filter pills, mono count). A `<Link>`, not a
 * button — clicking a tile navigates straight into the focused view.
 * `overlay` is the Manage ⋯ affordance a later task (9) draws over the art;
 * unused here.
 */

export function CourtTile({
  playerName,
  name,
  nameAdornment,
  pills,
  countLabel,
  cut,
  dots,
  href,
  overlay,
}: {
  playerName: string;
  name: string;
  /** A small glyph beside `name` — the saved-views band's `users` "shared" mark. */
  nameAdornment?: ReactNode;
  pills: string[];
  countLabel: string;
  cut: Cut;
  dots: VizDot[];
  href: string;
  overlay?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-200 ease-[var(--ease-primary)] hover:border-[var(--border-medium)] hover:shadow-[var(--shadow-card-emphasis)] motion-reduce:transition-none"
    >
      <div className="relative overflow-hidden rounded-t-[var(--radius-card)]">
        <CourtArt cut={cut} dots={dots} className="block" />
        <span
          className="absolute top-[10px] left-[10px] inline-flex h-5 items-center rounded-full px-[7px] text-[10px] font-medium text-white"
          style={{ backgroundColor: "rgba(13,13,13,.72)" }}
        >
          {playerName}
        </span>
        {overlay}
      </div>
      <div className="flex flex-col gap-2 px-4 pt-[14px] pb-[15px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <p
            className="truncate text-[16px] leading-tight font-normal"
            style={{ letterSpacing: "-0.2px", color: "var(--ink-900)" }}
          >
            {name}
          </p>
          {nameAdornment}
        </span>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {pills.map((pill) => (
              <span
                key={pill}
                className="inline-flex h-5 items-center rounded-[6px] border px-[7px] text-[10px] font-medium whitespace-nowrap"
                style={{
                  backgroundColor: "var(--surface-subtle)",
                  borderColor: "var(--border-hairline)",
                  color: "var(--ink-700)",
                }}
              >
                {pill}
              </span>
            ))}
          </div>
          <span
            className="shrink-0 font-mono text-[11px] tabular-nums"
            style={{ color: "var(--ink-500)" }}
          >
            {countLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}
