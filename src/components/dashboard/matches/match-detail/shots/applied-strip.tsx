"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FloatMenuTone } from "@/components/ui/float-menu";
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
 *
 * Phase 2A: `tone="dark"` draws the fullscreen viewer's bottom-slab tokens
 * (f4b-report P2b/P2h — `rgba(255,255,255,.1)`, X at 55% white → white) and
 * `readOnly` draws the P2e/P2f/P2g non-removable variant a loaded saved view
 * shows (no X, tighter `padding:0 9px`, no trailing "Clear" — there is
 * nothing to clear on a view that's just being looked at).
 */
export function AppliedStrip({
  tone = "light",
  readOnly = false,
  fullscreen = false,
}: {
  tone?: FloatMenuTone;
  readOnly?: boolean;
  fullscreen?: boolean;
} = {}) {
  const { state, setState } = useVizState();
  const entries = activeFilterEntries(state);
  const dark = tone === "dark";

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
      className={cn(
        "flex min-w-0 items-center gap-1.5",
        fullscreen ? "w-max flex-nowrap" : "flex-wrap",
      )}
    >
      {entries.map((entry) => (
        <span
          key={`${entry.key}:${entry.value}`}
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 text-[11px]",
            VIZ_PILL_RADIUS,
            readOnly ? "px-[9px]" : "py-0 pr-1 pl-2",
          )}
          style={
            dark
              ? { backgroundColor: "rgba(255,255,255,0.1)" }
              : {
                  backgroundColor: "var(--surface-subtle)",
                  border: "1px solid var(--border-hairline)",
                  color: "var(--ink-700)",
                }
          }
        >
          <span className={cn("truncate", dark && "text-white")}>
            {entry.label}
          </span>
          {!readOnly && (
            <button
              type="button"
              aria-label={`Remove ${entry.label}`}
              onClick={() => removeToken(entry.key, entry.value)}
              className={cn(
                "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200",
                dark
                  ? "text-white/55 hover:bg-white/10 hover:text-white"
                  : "text-[var(--ink-400)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink-700)]",
              )}
            >
              <X className="size-2.5" strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={clearAll}
          className="shrink-0 cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)] hover:text-[var(--blue-hover)]"
        >
          Clear
        </button>
      )}
    </div>
  );
}
