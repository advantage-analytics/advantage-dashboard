"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ListFilter } from "lucide-react";

/**
 * One Filter button for every category, in place of a chip per category.
 *
 * Five chips ran the width of the toolbar and each one cost a click to learn
 * it held nothing — the values are drawn from the matches themselves, so a
 * player with only hard-court matches still saw a Court chip. A single button
 * carries the whole filter count in one badge and puts every category behind
 * one press, which also leaves the toolbar's left side quiet enough for the
 * result count to be read at a glance.
 *
 * The design supplies the trigger but never draws the panel open, so the panel
 * below is ours: grouped checkboxes in the same visual language as the
 * dropdowns already in this toolbar.
 */

export interface FilterGroup<K extends string> {
  key: K;
  label: string;
  values: string[];
  displayValue?: (value: string) => string;
}

interface MatchesFilterPanelProps<K extends string> {
  groups: FilterGroup<K>[];
  /** Every active (key, value) pair, across all groups. */
  activeCount: number;
  isActive: (key: K, value: string) => boolean;
  onToggle: (key: K, value: string) => void;
  onClear: () => void;
}

export function MatchesFilterPanel<K extends string>({
  groups,
  activeCount,
  isActive,
  onToggle,
  onClear,
}: MatchesFilterPanelProps<K>): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = "matches-filter-panel";

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const closeAndReturn = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeAndReturn();
    }
  }

  // A panel with nothing in it is a button that does nothing when pressed.
  const populated = groups.filter((g) => g.values.length > 0);
  if (populated.length === 0) return null;

  const hasActive = activeCount > 0;

  return (
    <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        title="Filter matches"
        className={`flex h-8 items-center gap-[7px] rounded-full px-3.5 text-xs font-medium ring-1 ring-inset transition-[color,background-color,box-shadow] duration-200 ${
          hasActive
            ? "bg-[#EBF2FD] text-[#3B82F6] ring-[#3B82F6]"
            : "bg-white text-[#525252] ring-[#EAECF0] hover:bg-[#F5F5F5]"
        }`}
      >
        <ListFilter
          className={`size-[13px] ${hasActive ? "text-[#3B82F6]" : "text-[#888888]"}`}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        Filter
        {hasActive && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#3B82F6] px-1 text-[10px] font-semibold text-white tabular-nums">
            {activeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            id={panelId}
            role="dialog"
            aria-label="Filter matches"
            className="absolute left-0 top-full z-20 mt-1.5 max-h-[calc(100vh-180px)] w-[372px] overflow-y-auto rounded-xl border border-[#E5E5EA] bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
          >
            {/* Two balanced columns. In one column the five categories run past
                600px and the last of them — Analysis, the reason this panel
                exists — sits below the fold. Multi-column balances the groups
                on its own, so the whole filter set is visible on open.
                Column flow is visual only; tab order still follows the DOM. */}
            <div className="columns-2 gap-x-2">
              {populated.map((group) => (
                <div
                  key={group.key}
                  role="group"
                  aria-label={group.label}
                  className="mb-1 break-inside-avoid"
                >
                  <p className="px-2.5 pb-1 pt-2 text-[9px] font-medium uppercase tracking-[1.5px] text-[#AAAAAA]">
                    {group.label}
                  </p>
                  {group.values.map((value) => {
                    const active = isActive(group.key, value);
                    return (
                      <button
                        key={value}
                        role="checkbox"
                        aria-checked={active}
                        onClick={() => onToggle(group.key, value)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-[background-color,color] duration-200 ${
                          active
                            ? "bg-[#EBF2FD] font-medium text-[#3B82F6]"
                            : "text-[#525252] hover:bg-[#F5F5F5]"
                        }`}
                      >
                        <span
                          className={`flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border ${
                            active ? "border-[#3B82F6] bg-[#3B82F6]" : "border-[#EAECF0]"
                          }`}
                        >
                          {active && (
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none" aria-hidden="true">
                              <path
                                d="M1 3L3 5L7 1"
                                stroke="white"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <span className="min-w-0 truncate">
                          {group.displayValue ? group.displayValue(value) : value}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {hasActive && (
              <div className="mt-1 border-t border-[#F3F3F3] pt-1">
                <button
                  onClick={onClear}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-[#888888] transition-[background-color,color] duration-200 hover:bg-[#F5F5F5] hover:text-[#525252]"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
