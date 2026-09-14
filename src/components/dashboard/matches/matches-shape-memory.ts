"use client";

import { useSyncExternalStore } from "react";
import type { MatchesListShape } from "./match-list-layout";

/**
 * The last list shape each workspace rendered, for the route's `loading.tsx`.
 *
 * That boundary shows before the server has counted anything, so it can only
 * draw the right number of rows from memory. Stored per device, so the common
 * path — open the app on Home, then click Matches — draws the real size the
 * first time. The server has no storage, so a hard load onto the route renders
 * the unknown shape and swaps at hydration (`getServerSnapshot`), rather than
 * failing to hydrate.
 */
const KEY = "matches:list-shape:";

let cachedRaw: string | null = null;
let cachedShape: MatchesListShape | undefined;

function read(workspaceId: string): MatchesListShape | undefined {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY + workspaceId);
  } catch {
    return undefined;
  }
  if (raw === cachedRaw) return cachedShape;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as MatchesListShape) : undefined;
    cachedShape =
      parsed &&
      Number.isInteger(parsed.rows) &&
      parsed.rows > 0 &&
      typeof parsed.needsYear === "boolean" &&
      typeof parsed.paged === "boolean"
        ? parsed
        : undefined;
  } catch {
    cachedShape = undefined;
  }
  return cachedShape;
}

export function rememberMatchesShape(
  workspaceId: string,
  shape: MatchesListShape,
): void {
  try {
    localStorage.setItem(KEY + workspaceId, JSON.stringify(shape));
  } catch {
    // Private mode or a full quota — the skeleton falls back to its default.
  }
}

const noSubscription = () => () => {};

export function useRecalledMatchesShape(
  workspaceId: string,
): MatchesListShape | undefined {
  return useSyncExternalStore(
    noSubscription,
    () => read(workspaceId),
    () => undefined,
  );
}
