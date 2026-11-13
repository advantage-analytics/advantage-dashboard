"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSavedView,
  duplicateSavedView,
  renameSavedView,
  restoreSavedView,
  setSavedViewShared,
} from "@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions";
import type { SavedViewAction } from "@/components/dashboard/matches/match-detail/shots/saved-view-title-menu";
import type { SavedViewRow } from "@/lib/data/saved-views-server";

const STATUS_MS = 6000;
const FAILED = "Couldn't save that change";

/** What the season's Saved wall and its open view manage views with. */
export interface SeasonSavedViewActions {
  /** A view's name while a rename is saving: the typed one, by view id. */
  names: Readonly<Record<string, string>>;
  /** Views deleted here and not yet gone from the server's cards. */
  removed: ReadonlySet<string>;
  /** The line above the Saved cards: what just happened, and its Undo. */
  /** `failed`: a change the server refused, as opposed to one that landed
   *  ("Deleted …") — the open view repeats only the refusals. */
  status: { text: string; undo?: () => void; failed?: boolean } | null;
  dismissStatus: () => void;
  run: (action: SavedViewAction, view: SavedViewRow) => void;
}

/**
 * Rename, duplicate, share and delete for a saved view on the player
 * profile's season page — the same server actions the match report's Saved
 * wall calls (`saved-views-band.tsx`).
 *
 * The season's cards are computed on the server, so there is no list here to
 * edit in place: a rename shows through `names` and a delete through
 * `removed` until `router.refresh()` brings the server's cards, and a
 * refused change is undone and said in `status`. Delete offers Undo for the
 * viewer's own view only, as the report does (the `deleted.mine` check
 * below; the server does not refuse a restore of anyone else's).
 */
export function useSeasonSavedViews(): SeasonSavedViewActions {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [names, setNames] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState<SeasonSavedViewActions["status"]>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function say(text: string, undo?: () => void, failed = false) {
    if (timer.current) clearTimeout(timer.current);
    setStatus({ text, undo, failed });
    timer.current = setTimeout(() => setStatus(null), STATUS_MS);
  }

  /** A change the server refused. */
  function fail(text: string) {
    say(text, undefined, true);
  }

  function dismissStatus() {
    if (timer.current) clearTimeout(timer.current);
    setStatus(null);
  }

  function unremove(id: string) {
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function restore(view: SavedViewRow) {
    startTransition(async () => {
      const result = await restoreSavedView({
        name: view.name,
        cut: view.cut,
        chart: view.chart,
        filters: view.filters,
        shared: view.shared,
        order: view.order,
      });
      if (!result.ok) {
        fail(
          result.error === "unsupported_cut_chart"
            ? "This kind of view can't be saved yet."
            : FAILED,
        );
        return;
      }
      router.refresh();
    });
  }

  function run(action: SavedViewAction, view: SavedViewRow) {
    if (action.kind === "rename") {
      const { name } = action;
      setNames((prev) => ({ ...prev, [view.id]: name }));
      startTransition(async () => {
        const result = await renameSavedView(view.id, name);
        if (!result.ok) {
          setNames((prev) => {
            const next = { ...prev };
            delete next[view.id];
            return next;
          });
          fail(
            result.error === "duplicate_name"
              ? `A view called “${name}” already exists.`
              : FAILED,
          );
          return;
        }
        router.refresh();
      });
      return;
    }

    if (action.kind === "duplicate") {
      startTransition(async () => {
        const result = await duplicateSavedView(view.id);
        if (!result.ok) {
          fail(
            result.error === "unsupported_cut_chart"
              ? "This kind of view can't be saved yet."
              : FAILED,
          );
          return;
        }
        router.refresh();
      });
      return;
    }

    if (action.kind === "share" || action.kind === "unshare") {
      const shared = action.kind === "share";
      startTransition(async () => {
        const result = await setSavedViewShared(view.id, shared);
        if (!result.ok) {
          fail(
            shared && result.error === "duplicate_name"
              ? `A shared view is already called "${view.name}". Rename yours first.`
              : FAILED,
          );
          return;
        }
        router.refresh();
      });
      return;
    }

    // Delete.
    setRemoved((prev) => new Set(prev).add(view.id));
    startTransition(async () => {
      const result = await deleteSavedView(view.id);
      if (!result.ok) {
        unremove(view.id);
        fail(FAILED);
        return;
      }
      const deleted = result.data;
      say(
        `Deleted “${deleted.name}” from all matches`,
        deleted.mine ? () => restore(deleted) : undefined,
      );
      router.refresh();
    });
  }

  return { names, removed, status, dismissStatus, run };
}
