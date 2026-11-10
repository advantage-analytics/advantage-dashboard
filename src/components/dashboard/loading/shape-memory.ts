"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * What a list looked like the last time this workspace rendered it, for that
 * route's loading skeleton.
 *
 * A skeleton shows before the server has counted anything, so it can only
 * draw the right number of rows from memory. The loaded page records its
 * shape with `useRememberShape`; the skeleton reads it back with
 * `useRecalledShape`. Stored per device and per workspace, so the common path
 * — open the app on Home, then click into a list — draws the real size the
 * first time. The server has no storage, so a hard load renders the caller's
 * default and swaps at hydration (`getServerSnapshot`) rather than failing to
 * hydrate.
 *
 * `surface` names the list (`"matches"`, `"roster"`, `"opponents:team"`);
 * `isShape` rejects anything stored by an older build or edited by hand.
 */
const PREFIX = "list-shape:";

const cache = new Map<string, { raw: string | null; shape: unknown }>();

function storageKey(surface: string, workspaceId: string): string {
  return `${PREFIX}${surface}:${workspaceId}`;
}

function read<T>(key: string, isShape: (value: unknown) => value is T) {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return undefined;
  }
  // Same string, same object: `useSyncExternalStore` compares snapshots by
  // identity and would loop on a fresh parse every render.
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.shape as T | undefined;
  let shape: T | undefined;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    shape = isShape(parsed) ? parsed : undefined;
  } catch {
    shape = undefined;
  }
  cache.set(key, { raw, shape });
  return shape;
}

const noSubscription = () => () => {};

export function useRecalledShape<T>(
  surface: string,
  workspaceId: string,
  isShape: (value: unknown) => value is T,
): T | undefined {
  const key = storageKey(surface, workspaceId);
  return useSyncExternalStore(
    noSubscription,
    () => read(key, isShape),
    () => undefined,
  );
}

function write(surface: string, workspaceId: string, serialised: string) {
  try {
    localStorage.setItem(storageKey(surface, workspaceId), serialised);
  } catch {
    // Private mode or a full quota — the skeleton falls back to its default.
  }
}

export function rememberShape(
  surface: string,
  workspaceId: string,
  shape: unknown,
): void {
  write(surface, workspaceId, JSON.stringify(shape));
}

/**
 * Records `shape` whenever it changes. Pass a JSON-stable value: it is
 * compared by its serialised form, so an object built fresh each render does
 * not write on every render.
 */
export function useRememberShape(
  surface: string,
  workspaceId: string,
  shape: unknown,
): void {
  const serialised = JSON.stringify(shape);
  useEffect(() => {
    write(surface, workspaceId, serialised);
  }, [surface, workspaceId, serialised]);
}

/** A whole count ≥ 0 — the field type every remembered shape is built from. */
export function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}
