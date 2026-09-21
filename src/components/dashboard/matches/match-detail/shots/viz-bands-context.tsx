"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { saveBandSettings } from "@/app/dashboard/matches/(detail)/[matchId]/viz-bands-actions";
import { bandsEqual, type BandSettings } from "@/lib/data/viz-bands";
import type { DistanceUnit } from "@/lib/format/distance";

/**
 * The Visualizations tab's OPTIMISTIC band state (Phase 2B, Task 3).
 *
 * A workspace's bands are a server record (`meta.bandSettings`, loaded once
 * in `page.tsx`), but picking a preset has to redraw the overlay AND the
 * `% · n` printed on it in the same frame — the numbers come from
 * `computeVizStats`, which buckets by the bands, so a preset that only
 * updated after the server round-trip would show new band rects over old
 * percentages for as long as the action took. That is exactly the "looks
 * correct, says something false" failure the guardrails are about.
 *
 * So the override lives HERE, above both readers:
 *
 * - `use-viz-view.ts` reads `useVizBands().bands` instead of
 *   `meta.bandSettings`, so the focused court's stats card behind the viewer
 *   and the viewer's own overlay follow the same value on the same frame;
 * - the provider is mounted once in `shots-tab.tsx`, inside
 *   `VizStateProvider`, so there is one override for the whole tab.
 *
 * The override is cleared when the server value CATCHES UP (`bandsEqual`),
 * never on a timer — `saveBandSettings` calls `revalidatePath`, so the new
 * `meta.bandSettings` arrives on its own and the override stops mattering at
 * exactly the moment it agrees. A failed save reverts it immediately and
 * hands the reason to the receipt slot.
 *
 * `contactHidden` is deliberately NOT part of that record: the contact
 * cuts' "No bands" row is a session-only toggle (the plan's rule — contact
 * cuts have no presets, and hiding the shading is not a change to the
 * workspace's numbers), so it never reaches the database and never leaves
 * this provider.
 *
 * Outside the provider (nothing does today, but `useVizView` is a public
 * hook) the hook degrades to a read-only view of `meta` rather than
 * throwing — a court that cannot change the bands can still draw them.
 */

export type BandReceipt =
  { kind: "saved"; message: string } | { kind: "error"; message: string };

export interface VizBandsValue {
  /** The bands every band-aware reader must use — the optimistic override
   *  while one is pending, otherwise the workspace's saved record. */
  bands: BandSettings;
  /** `meta.canEditBands` — personal owner, or team owner/coach/staff. */
  canEdit: boolean;
  /** The unit every band label is rendered in. Hard-wired to `"ft"` until
   *  Stage 2C adds the preference; every consumer already takes it as a
   *  value so that stage is a one-line change here. */
  unit: DistanceUnit;
  /** Session-only: the contact cuts' overlay is hidden. */
  contactHidden: boolean;
  toggleContactHidden(): void;
  /** Apply a preset: optimistic locally, then persisted. */
  applyBands(next: BandSettings): void;
  /** A save is in flight — the menu's rows stand down rather than queueing. */
  saving: boolean;
  /** What the viewer's filter-pill slot should show instead of the pill. */
  receipt: BandReceipt | null;
}

/** P2n: the receipt holds the pill slot for four seconds, then the filter
 *  summary returns. An ERROR holds longer — it is the only thing telling a
 *  coach their pick did not land, and four seconds is short enough to miss
 *  while looking at the court. */
const RECEIPT_MS = 4000;
const ERROR_RECEIPT_MS = 6000;

const VizBandsContext = createContext<VizBandsValue | null>(null);

function noop(): void {}

export function useVizBands(): VizBandsValue {
  const ctx = useContext(VizBandsContext);
  const { meta } = useMatchReport();
  const fallback = useMemo<VizBandsValue>(
    () => ({
      bands: meta.bandSettings,
      canEdit: meta.canEditBands,
      unit: "ft",
      contactHidden: false,
      toggleContactHidden: noop,
      applyBands: noop,
      saving: false,
      receipt: null,
    }),
    [meta.bandSettings, meta.canEditBands],
  );
  return ctx ?? fallback;
}

export function VizBandsProvider({ children }: { children: ReactNode }) {
  const { meta } = useMatchReport();
  const saved = meta.bandSettings;

  const [override, setOverride] = useState<BandSettings | null>(null);
  const [contactHidden, setContactHidden] = useState(false);
  const [receipt, setReceipt] = useState<BandReceipt | null>(null);
  const [saving, startSaving] = useTransition();

  // One timer, cleared on every replacement and on unmount — two saves in
  // quick succession must not leave the first one's timeout to wipe the
  // second one's receipt early.
  const receiptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showReceipt = useCallback((next: BandReceipt) => {
    if (receiptTimer.current !== null) clearTimeout(receiptTimer.current);
    setReceipt(next);
    receiptTimer.current = setTimeout(
      () => {
        setReceipt(null);
        receiptTimer.current = null;
      },
      next.kind === "error" ? ERROR_RECEIPT_MS : RECEIPT_MS,
    );
  }, []);
  useEffect(() => {
    return () => {
      if (receiptTimer.current !== null) clearTimeout(receiptTimer.current);
    };
  }, []);

  // The server caught up: the override and the record now say the same
  // thing, so the override has nothing left to say. DERIVED during render
  // rather than cleared in an effect — an effect would be a second render
  // pass for a value that is already knowable from the two inputs, and the
  // stale `override` in state is harmless once it is no longer read (the
  // next `applyBands` replaces it outright). This also covers the value
  // changing somewhere else entirely — another tab, another surface — and
  // arriving on a revalidation.
  const effectiveBands =
    override && !bandsEqual(override, saved) ? override : saved;

  const workspaceName = meta.workspaceName;
  const applyBands = useCallback(
    (next: BandSettings) => {
      setOverride(next);
      startSaving(async () => {
        const result = await saveBandSettings(next);
        if (result.ok) {
          // Trust the row the database actually stored (rounded to the
          // column's own 2dp), not the value we sent — otherwise the
          // override could never equal `saved` and would never clear.
          setOverride(result.data);
          showReceipt({
            kind: "saved",
            message: workspaceName
              ? `Bands saved · every return chart in ${workspaceName}`
              : "Bands saved · every return chart in this workspace",
          });
          return;
        }
        setOverride(null);
        showReceipt({
          kind: "error",
          message:
            result.error === "forbidden"
              ? "Bands not saved · only coaches and staff can change this team's bands"
              : "Bands not saved · something went wrong, try again",
        });
      });
    },
    [showReceipt, workspaceName],
  );

  const toggleContactHidden = useCallback(() => {
    setContactHidden((prev) => !prev);
  }, []);

  const value = useMemo<VizBandsValue>(
    () => ({
      bands: effectiveBands,
      canEdit: meta.canEditBands,
      unit: "ft",
      contactHidden,
      toggleContactHidden,
      applyBands,
      saving,
      receipt,
    }),
    [
      effectiveBands,
      meta.canEditBands,
      contactHidden,
      toggleContactHidden,
      applyBands,
      saving,
      receipt,
    ],
  );

  return <VizBandsContext value={value}>{children}</VizBandsContext>;
}
