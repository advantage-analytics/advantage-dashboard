import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The page's two columns, shared with the route's `loading.tsx` so the
 * skeleton cannot drift from the layout it stands in for. Its own file, with no
 * `"use client"`, because a Server Component reads `ASK_COLUMN` as a string:
 * imported from a client module it would arrive as a reference, not a value.
 *
 * The centre column takes the page gutter (20px 56px); what it holds is
 * capped at 720px by `ASK_COLUMN`. The rail is 340px behind a hairline and
 * drops under the column below `lg`, where there is no room beside it. Not a
 * `<main>` — the dashboard shell already is one.
 */
export function AskFrame({
  children,
  rail,
  className,
}: {
  children: ReactNode;
  rail: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-1 flex-col bg-[var(--surface-card)] lg:flex-row",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-6 px-14 pt-5">
        {children}
      </div>
      <aside
        aria-label="Question context"
        className="flex w-full shrink-0 flex-col gap-7 border-t border-[var(--border-hairline)] px-[22px] py-6 lg:w-[340px] lg:border-t-0 lg:border-l"
      >
        {rail}
      </aside>
    </div>
  );
}

/** The measure the thread and the composer share. */
export const ASK_COLUMN = "w-full max-w-[720px]";
