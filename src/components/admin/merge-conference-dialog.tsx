"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Loader2, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogProblem } from "@/components/ui/dialog-problem";
import { ConfirmList } from "@/components/ui/confirm-dialog";
import { ConferenceMark } from "@/components/admin/conference-mark";
import { useListboxNav } from "@/hooks/use-listbox-nav";
import { mergeConferences } from "@/lib/services/programs/admin-conference-actions";
import type { AdminConferenceRow } from "@/lib/data/admin-conferences-view";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/**
 * Admin › Conferences › ⋯ › Merge into…
 *
 * A 440px `Dialog` in `add-conference-dialog.tsx`'s shape, in two states:
 *
 *   choosing   a typeahead over the rows the page already loaded (minus the
 *              source) — no round trip, all ~137 are on the client
 *   chosen     the target as a row with "Change", the `ConfirmList` of what
 *              the merge costs, and the red "Merge conferences"
 *
 * Not a `ConfirmDialog`: that is an `AlertDialog` whose body is a sentence
 * about a decision already made, and this one makes the decision first.
 *
 * The merge itself — move every program, let the mirror trigger rewrite each
 * `programs.conference`, delete the source, one audit row per program — is
 * `admin_merge_conferences`; this only calls `mergeConferences`. On success it
 * hands the target to `onMerged`, and the page points `?id=` at it and
 * refreshes, so the drawer lands on the conference that survived.
 */

const teamsPhrase = (count: number) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? "team" : "teams"}`;

export function MergeConferenceDialog({
  open,
  onOpenChange,
  source,
  conferences,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: AdminConferenceRow;
  /** Every conference the page loaded — the source is dropped here. */
  conferences: readonly AdminConferenceRow[];
  /** The merge landed — the page points `?id=` (and the drawer) at the target. */
  onMerged: (targetId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startMerging] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const candidates = useMemo(
    () => conferences.filter((row) => row.id !== source.id),
    [conferences, source.id],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        (row.shortName?.toLowerCase().includes(needle) ?? false),
    );
  }, [candidates, query]);

  // Resolved from the loaded rows on every render, so a refresh that drops the
  // target (merged away in another tab) empties the choice rather than
  // pointing at a conference that no longer exists.
  const target = targetId
    ? (candidates.find((row) => row.id === targetId) ?? null)
    : null;
  const choosing = open && target === null;

  const reset = () => {
    setQuery("");
    setTargetId(null);
    setProblem(null);
  };

  // Everything resets on close: reopening is a new question.
  const close = (next: boolean) => {
    if (!next && pending) return;
    onOpenChange(next);
    if (!next) reset();
  };

  const pick = (index: number) => {
    const row = matches[index];
    if (!row) return;
    setTargetId(row.id);
    setProblem(null);
  };

  const { activeIndex, setActiveIndex, optionId, onKeyDown } = useListboxNav({
    count: matches.length,
    open: choosing,
    onSelect: pick,
    onDismiss: () => setQuery(""),
    idPrefix: listId,
  });

  // The hook leaves scrolling to the caller.
  useEffect(() => {
    if (!choosing) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(optionId(activeIndex))}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, choosing, optionId]);

  const change = () => {
    setTargetId(null);
    setProblem(null);
    // The input mounts on this render; focus it once it is there.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const merge = () => {
    if (!target) return;
    const into = target;
    setProblem(null);
    startMerging(async () => {
      const result = await mergeConferences(source.id, into.id);
      if (!result.ok) {
        setProblem(result.error);
        return;
      }
      onOpenChange(false);
      reset();
      onMerged(result.targetId);
    });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        hideCloseButton
        className="gap-0 border-0 bg-[var(--surface-card)] p-0 sm:max-w-none"
        style={{
          width: "440px",
          maxWidth: "calc(100vw - 32px)",
          borderRadius: "14px",
          boxShadow: "var(--shadow-dropdown)",
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex flex-col gap-[18px] p-6 pb-5">
          <div className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-left text-[16px] font-medium break-words text-[var(--ink-900)]">
                Merge {source.name} into…
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-[12px] leading-[1.55] text-pretty text-[var(--ink-600)]">
                Every team moves to the conference you choose, then{" "}
                {source.name} is deleted.
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="Close"
              disabled={pending}
              onClick={() => close(false)}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>

          {target ? (
            <>
              {/* The chosen target, with the way back to the list. */}
              <div className="flex items-center gap-2.5">
                <ConferenceMark
                  name={target.name}
                  shortName={target.shortName}
                  size={24}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-900)]">
                  {target.name}
                </span>
                <span className="shrink-0 text-[11px] text-[var(--ink-500)] tabular-nums">
                  {teamsPhrase(target.teams)}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={change}
                  className="shrink-0 cursor-pointer rounded-[4px] text-[12px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                >
                  Change
                </button>
              </div>

              <ConfirmList
                items={[
                  `${teamsPhrase(source.teams)} move to ${target.name}`,
                  `${source.name} is deleted`,
                  `Every reader of the conference name sees ${target.name}'s`,
                ]}
              />
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-0 size-3 -translate-y-1/2 text-[var(--ink-500)]"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <input
                  ref={inputRef}
                  type="text"
                  role="combobox"
                  aria-label="Search conferences"
                  aria-expanded={choosing}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    matches.length > 0 ? optionId(activeIndex) : undefined
                  }
                  value={query}
                  placeholder="Search conferences"
                  autoComplete="off"
                  spellCheck={false}
                  data-focus-ring="none"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onKeyDown}
                  className={cn(
                    advField("underline"),
                    "w-full pl-5 outline-none",
                  )}
                />
              </div>

              <div
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label="Conferences"
                className="max-h-[240px] overflow-y-auto overscroll-contain"
              >
                {matches.length === 0 ? (
                  <p className="px-2.5 py-[7px] text-[12px] text-[var(--ink-500)]">
                    {query.trim()
                      ? `No conference matches “${query.trim()}”`
                      : "No other conference to merge into."}
                  </p>
                ) : (
                  matches.map((row, index) => (
                    <div
                      key={row.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseMove={() => setActiveIndex(index)}
                      // Down, not click: the input would blur first.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pick(index);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-[6px]",
                        index === activeIndex && "bg-[var(--surface-subtle)]",
                      )}
                    >
                      <ConferenceMark
                        name={row.name}
                        shortName={row.shortName}
                        size={24}
                      />
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
                        {row.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--ink-500)] tabular-nums">
                        {teamsPhrase(row.teams)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <DialogProblem message={problem} />

          <div className="flex items-center gap-2.5 pt-0.5">
            <span className="flex-1" />
            <button
              type="button"
              className={advButton("outline", "sm")}
              onClick={() => close(false)}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!target || pending}
              aria-busy={pending || undefined}
              onClick={merge}
              className={cn(
                advButton("danger-solid", "sm"),
                pending && "disabled:opacity-100",
              )}
            >
              {pending ? (
                <>
                  <Loader2
                    className="size-3.5 animate-spin"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  Merging…
                </>
              ) : (
                "Merge conferences"
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
