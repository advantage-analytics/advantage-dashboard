"use client";

import { useSyncExternalStore } from "react";
import {
  isCount,
  useRecalledShape,
  useRememberShape,
} from "@/components/dashboard/loading/shape-memory";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { ListPending, type ListKind } from "./list-pending";

/**
 * How many rows each Home list drew the last time this workspace rendered it,
 * for the lists' loading skeletons — `loading/shape-memory.ts` keyed to the
 * Home, one count per list. Both Homes cap their lists (six matches, six
 * players, five numbers), so a count is the whole shape.
 */
const TITLES: Record<ListKind, string> = {
  matches: "Latest matches",
  players: "Players",
  numbers: "Your numbers",
  yours: "Your matches",
  team: "Latest from the team",
  playerNumbers: "Your numbers",
};

/** Before anything has been read on this device: a mid-sized list. */
const DEFAULT_ROWS = 5;
/** A list that was empty comes back as its empty state's three ghost rows. */
const EMPTY_ROWS = 3;
/** The most rows each list ever draws. */
const MAX_ROWS: Record<ListKind, number> = {
  matches: 6,
  players: 6,
  numbers: 5,
  yours: 6,
  team: 3,
  playerNumbers: 8,
};

/**
 * What a list that last drew nothing comes back as. Most lists keep their
 * place with an empty state (three ghost rows); the team's latest is simply
 * absent when there is nothing to show, so its skeleton is too.
 */
const emptyRows = (list: ListKind) => (list === "team" ? 0 : EMPTY_ROWS);

const rowsFor = (list: ListKind, recalled: number | undefined) =>
  recalled === undefined
    ? Math.min(DEFAULT_ROWS, MAX_ROWS[list])
    : recalled === 0
      ? emptyRows(list)
      : Math.min(recalled, MAX_ROWS[list]);

const surface = (list: ListKind) => `home:${list}`;

/**
 * Rendered by each loaded list (server components, so this is their client
 * hook): teaches the skeleton this workspace's row count for the next visit.
 * Renders nothing.
 */
export function RememberHomeRows({
  list,
  rows,
}: {
  list: ListKind;
  rows: number;
}) {
  const { active } = useWorkspace();
  useRememberShape(surface(list), active.id, rows);
  return null;
}

const noSubscription = () => () => {};

/**
 * A Home list's skeleton, at the row count this workspace last drew.
 *
 * The count lives in `localStorage`, which the server cannot read — and on a
 * hard load the list's data often arrives before React hydrates, so a
 * skeleton that waited for hydration to learn its size would draw the default
 * and then jump. So the server-rendered skeleton draws every row the list
 * could have, and a script inline in the same HTML hides the ones this
 * workspace did not have, before the first paint. Once hydrated (and on every
 * client navigation) the count is read directly and no script is rendered.
 */
export function HomeListPending({ list }: { list: ListKind }) {
  const { active } = useWorkspace();
  const recalled = useRecalledShape(surface(list), active.id, isCount);
  const hydrating = useSyncExternalStore(
    noSubscription,
    () => false,
    () => true,
  );
  if (!hydrating) {
    const rows = rowsFor(list, recalled);
    // A list that is absent when empty draws no skeleton either.
    if (rows === 0) return null;
    return <ListPending title={TITLES[list]} kind={list} rows={rows} />;
  }
  // `list-shape:` + surface + workspace is `shape-memory.ts`'s storage key.
  const key = JSON.stringify(`list-shape:${surface(list)}:${active.id}`);
  const script = `(function(){try{var s=document.currentScript,v=JSON.parse(localStorage.getItem(${key})),n=Number.isInteger(v)&&v>=0?(v===0?${emptyRows(list)}:Math.min(v,${MAX_ROWS[list]})):${Math.min(DEFAULT_ROWS, MAX_ROWS[list])};if(n===0){s.closest("[data-pending-list]").style.display="none";return}s.parentElement.querySelectorAll("[data-pending-row]").forEach(function(r,i){if(i>=n)r.style.display="none"})}catch(e){}})()`;
  return (
    <ListPending
      title={TITLES[list]}
      kind={list}
      rows={MAX_ROWS[list]}
      after={
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: script }}
        />
      }
    />
  );
}

/**
 * The two lists under the top row, for a route fallback that has only the
 * workspace to go on: a player's Team Home has their matches over the team's
 * latest beside their numbers; everyone else has the program's two lists.
 */
export function TeamListsPending() {
  const { active } = useWorkspace();
  const player =
    active.kind === "team" &&
    active.role === "player" &&
    active.myPlayerId != null;
  if (!player) {
    return (
      <>
        <HomeListPending list="matches" />
        <HomeListPending list="players" />
      </>
    );
  }
  return (
    <>
      <div className="flex min-w-0 flex-col gap-5">
        <HomeListPending list="yours" />
        <HomeListPending list="team" />
      </div>
      <HomeListPending list="playerNumbers" />
    </>
  );
}
