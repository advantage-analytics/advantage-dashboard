"use client";

import { X } from "lucide-react";
import { useVizState } from "./use-viz-state";
import { activeFilterEntries, clearedFilters } from "./viz-url";
import { VIZ_PILL_RADIUS } from "./viz-labels";
import { EMPTY_VIZ_FILTERS, type VizFilters } from "./viz-model";

/**
 * The applied-filters strip (P1f): one removable token per active filter
 * VALUE — a group with two values selected draws two tokens — plus a
 * trailing "Clear". Lives in `viz-toolbar.tsx`'s `stripSlot`, right after
 * the cut/chart menus — `viz-focused.tsx` only passes it in when there is at
 * least one token, so the toolbar's hairline divider drops with it. This
 * component also guards on its own (`activeFilterEntries` empty → `null`)
 * so it stays correct if ever mounted unconditionally.
 *
 * Removing a token drops just that one value out of its group's list
 * (`player`, the one scalar filter, resets to `EMPTY_VIZ_FILTERS.player`
 * instead, since there's no list to narrow). "Clear" resets every key at
 * once, "player" included, dropping the view back to P1g (no filters,
 * subject `you`).
 */
export function AppliedStrip() {
  const { state, setState } = useVizState();
  const entries = activeFilterEntries(state);

  if (entries.length === 0) {
    return null;
  }

  function removeToken(key: keyof VizFilters, value: string) {
    setState((prev) => {
      if (key === "player") {
        return {
          ...prev,
          filters: { ...prev.filters, player: EMPTY_VIZ_FILTERS.player },
          viewId: null,
        };
      }
      const current = prev.filters[key] as readonly (string | number)[];
      const next = current.filter((v) => String(v) !== value);
      return {
        ...prev,
        filters: { ...prev.filters, [key]: next },
        viewId: null,
      };
    });
  }

  function clearAll() {
    setState((prev) => clearedFilters(prev));
  }

  return (
    <div
      role="group"
      aria-label="Applied filters"
      className="flex min-w-0 flex-wrap items-center gap-1.5"
    >
      {entries.map((entry) => (
        <span
          key={`${entry.key}:${entry.value}`}
          className={`inline-flex h-6 shrink-0 items-center gap-1 py-0 pr-1 pl-2 text-[11px] ${VIZ_PILL_RADIUS}`}
          style={{
            backgroundColor: "var(--surface-subtle)",
            border: "1px solid var(--border-hairline)",
            color: "var(--ink-700)",
          }}
        >
          <span className="truncate">{entry.label}</span>
          <button
            type="button"
            aria-label={`Remove ${entry.label}`}
            onClick={() => removeToken(entry.key, entry.value)}
            className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ink-400)] transition-colors duration-200 hover:bg-[var(--surface-muted)] hover:text-[var(--ink-700)]"
          >
            <X className="size-2.5" strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="shrink-0 cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)] hover:text-[var(--blue-hover)]"
      >
        Clear
      </button>
    </div>
  );
}
