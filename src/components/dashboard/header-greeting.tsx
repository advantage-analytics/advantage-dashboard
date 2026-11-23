"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * The header's leading slot on both Homes: the workspace in the slot's
 * 12px/500 register, and beside it in micro type the date — "Personal ·
 * Monday, Aug 24".
 *
 * The salutation itself is the page's own title now (`HomeTitle`): each Home
 * opens on "Good morning, Jordan" over its status line, so the header names
 * where you are rather than greeting a second time.
 *
 * The date is the BROWSER's: the server runs in UTC, and its "today" is
 * tomorrow for an evening reader in the Americas. It is read through
 * `useSyncExternalStore` so the server and the first client render agree on
 * an empty string, and it fades in rather than popping.
 */
const subscribe = () => () => {};
const readBrowserDate = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
const readServerDate = () => "";

export function HeaderGreeting({ workspaceName }: { workspaceName: string }) {
  const dateText = useSyncExternalStore(
    subscribe,
    readBrowserDate,
    readServerDate,
  );

  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-[12px] font-medium text-[var(--ink-900)]">
        {workspaceName}
      </span>
      <span
        className={cn(
          "text-micro tabular transition-opacity duration-300",
          dateText ? "opacity-100" : "opacity-0",
        )}
      >
        {dateText}
      </span>
    </span>
  );
}
