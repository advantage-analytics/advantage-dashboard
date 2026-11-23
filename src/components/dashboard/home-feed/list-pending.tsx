import type { ReactNode } from "react";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { LIST_CARD, LIST_ROW, SectionHead } from "./home-title";

/**
 * Every list a Home draws. `yours`, `team` and `playerNumbers` are the player's
 * Team Home: their own matches, their teammates' latest, and their numbers.
 */
export type ListKind =
  "matches" | "players" | "numbers" | "yours" | "team" | "playerNumbers";

/** What leads and trails one loading row, per list: the loaded row's shape. */
const MATCH_ROW = {
  lead: "h-[44px] w-[78px] shrink-0 rounded-[6px]",
  lines: ["w-44", "w-32"] as [string, string],
  tail: "w-28",
};

const NUMBER_ROW = {
  lead: null,
  lines: ["w-28", "w-24"] as [string, string],
  tail: "w-36",
};

const ROW_SHAPE: Record<
  ListKind,
  { lead: string | null; lines: [string, string]; tail: string }
> = {
  matches: MATCH_ROW,
  players: {
    lead: "size-8 shrink-0 rounded-full",
    lines: ["w-32", "w-28"],
    tail: "w-20",
  },
  numbers: NUMBER_ROW,
  yours: MATCH_ROW,
  team: MATCH_ROW,
  playerNumbers: NUMBER_ROW,
};

/**
 * A list under its real heading, loading: `rows` rows in the loaded row's
 * shape. The count comes from `HomeListPending` (`home-shape-memory.tsx`),
 * which remembers what this workspace last drew.
 */
export function ListPending({
  title,
  kind,
  rows,
  after,
}: {
  title: string;
  kind: ListKind;
  rows: number;
  /** Rendered after the rows, inside the same wrapper (`HomeListPending`). */
  after?: ReactNode;
}) {
  const shape = ROW_SHAPE[kind];
  return (
    <div data-pending-list className="flex min-w-0 flex-col gap-2.5">
      <SectionHead title={title} />
      <PendingRegion label={title.toLowerCase()} className={LIST_CARD}>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            data-pending-row
            className={LIST_ROW}
            // `HomeListPending`'s inline script may hide a row before React
            // hydrates it.
            suppressHydrationWarning
          >
            {shape.lead ? <PendingBar className={shape.lead} /> : null}
            <span className="flex flex-1 flex-col gap-2">
              <PendingBar className={shape.lines[0]} />
              <PendingBar className={shape.lines[1]} />
            </span>
            <PendingBar className={shape.tail} />
          </div>
        ))}
        {after}
      </PendingRegion>
    </div>
  );
}
