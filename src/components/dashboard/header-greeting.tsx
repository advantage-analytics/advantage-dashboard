"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * The header's leading slot on the personal Home — Platform Audit Pa2.
 *
 * "Good morning, Jordan" in the slot's 12px/500 register, and beside it in
 * micro type the workspace and the date: "Personal · Monday, Aug 24". The
 * greeting used to be the page's 30px display line; Pa2 moves it up here, "the
 * one place that already carries who and where you are", so the page can open
 * on a title and the largest type on the first screen is a statistic, not a
 * salutation.
 *
 * The greeting word arrives from the server (`timeOfDayGreeting`, computed
 * once per request in the dashboard layout), so it is in the HTML on first
 * paint. The date is timezone-dependent, so it is the browser's: read through
 * `useSyncExternalStore` with an empty server snapshot, which is React's own
 * shape for "render this only once hydrated" — no effect, no setState after
 * mount. It fades in, the way the page's own greeting row handled it before it
 * moved. Until then the slot reads "Personal", which is what every other
 * top-level page shows here, so nothing jumps.
 *
 * No trailing full stop, unlike the display greeting it replaces: at 12px in
 * a chrome slot the sentence reads as a label, and labels do not end in one.
 */

const subscribe = () => () => {};
const readBrowserDate = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
const readServerDate = () => "";

export function HeaderGreeting({
  greeting,
  firstName,
  workspaceName,
}: {
  /** "Good morning" / "Good afternoon" / "Good evening". */
  greeting: string;
  /** `Viewer.firstName` — null drops the name rather than substituting. */
  firstName: string | null;
  /** "Personal" — passed rather than typed here so the slot cannot drift from the switcher. */
  workspaceName: string;
}) {
  const dateText = useSyncExternalStore(
    subscribe,
    readBrowserDate,
    readServerDate,
  );

  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-[12px] font-medium text-[var(--ink-900)]">
        {firstName ? `${greeting}, ${firstName}` : greeting}
      </span>
      {/* `text-micro` as the frame draws it. The separator rides with the
          date so the slot never shows a dangling middot before the date is
          known. */}
      <span className="text-micro">
        {workspaceName}
        <span
          className={cn(
            "tabular transition-opacity duration-300",
            dateText ? "opacity-100" : "opacity-0",
          )}
        >
          {dateText ? ` · ${dateText}` : ""}
        </span>
      </span>
    </span>
  );
}
