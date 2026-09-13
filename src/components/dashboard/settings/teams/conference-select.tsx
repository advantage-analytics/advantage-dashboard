"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useListboxNav } from "@/hooks/use-listbox-nav";
import { cn } from "@/lib/utils";

/**
 * Conference — a select you can type into.
 *
 * Not `MenuSelect`: a division lists up to 42 conferences (a college with no
 * division on file, all ~137), and a menu that long is a scroll hunt for a name the owner already knows how to spell. The
 * trigger is `MenuSelect`'s underline trigger to the pixel, so the grid still
 * reads as one row of fields; the popover is `FloatMenu`'s geometry with a
 * filter line on top.
 *
 * Choose-only, on purpose. Conference is the key other programs are matched
 * on (`getConferenceTable`), so a typed name the directory has never seen
 * would silently empty Opponents. A saved value the directory no longer lists
 * still renders and stays chosen — it is the program's record, not ours to
 * drop on open.
 */
export function ConferenceSelect({
  value,
  options,
  division,
  onChange,
}: {
  value: string;
  /** The division's conferences, sorted. */
  options: readonly string[];
  division: string | null;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const all = useMemo(
    () => (value && !options.includes(value) ? [value, ...options] : options),
    [options, value],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? all.filter((name) => name.toLowerCase().includes(needle))
      : all;
  }, [all, query]);

  const setOpenAndReset = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  }, []);

  const pick = useCallback(
    (index: number) => {
      const next = matches[index];
      if (next === undefined) return;
      setOpenAndReset(false);
      if (next !== value) onChange(next);
    },
    [matches, onChange, setOpenAndReset, value],
  );

  const { activeIndex, setActiveIndex, optionId, onKeyDown } = useListboxNav({
    count: matches.length,
    open,
    onSelect: pick,
    onDismiss: () => setOpenAndReset(false),
    idPrefix: listId,
  });

  // The hook leaves scrolling to the caller — the one part that depends on
  // how the list is laid out.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(optionId(activeIndex))}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, optionId]);

  return (
    <Popover open={open} onOpenChange={setOpenAndReset}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Conference"
          aria-haspopup="listbox"
          aria-expanded={open}
          data-focus-ring="none"
          className={cn(
            "flex h-[34px] w-full cursor-pointer items-center justify-between gap-2 rounded-none border-b bg-transparent text-left text-[13px] text-[var(--ink-900)] transition-colors duration-150",
            "focus-visible:border-b-2 focus-visible:border-[var(--blue)] focus-visible:outline-none",
            open
              ? "border-b-2 border-[var(--blue)]"
              : "border-[var(--border-field)]",
          )}
        >
          <span className={cn("truncate", !value && "text-[var(--ink-400)]")}>
            {value || "Select conference"}
          </span>
          <ChevronDown
            className="size-3 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        className="flex w-[var(--radix-popover-trigger-width)] min-w-[260px] flex-col rounded-[10px] p-[5px] shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]"
      >
        <div className="flex h-9 items-center gap-2 border-b border-[var(--border-hairline)] px-2.5">
          <Search
            className="size-3 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search conferences"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              matches.length > 0 ? optionId(activeIndex) : undefined
            }
            value={query}
            placeholder="Search conferences"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            data-focus-ring="none"
            className="h-full min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink-900)] placeholder:text-[var(--ink-400)] focus:outline-none"
          />
        </div>

        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Conferences"
          className="mt-[5px] max-h-[264px] overflow-y-auto overscroll-contain"
        >
          {matches.length === 0 ? (
            <p className="px-2.5 py-[7px] text-[12px] text-[var(--ink-500)]">
              No {division ? `${division} ` : ""}conference matches “
              {query.trim()}”
            </p>
          ) : (
            matches.map((name, index) => {
              const chosen = name === value;
              return (
                <div
                  key={name}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseMove={() => setActiveIndex(index)}
                  // Down, not click: the input would blur first and a click
                  // landing on a closing popover is lost.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(index);
                  }}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-[7px] px-2.5 py-[7px]",
                    index === activeIndex && "bg-[var(--surface-subtle)]",
                  )}
                >
                  <span className="mt-[3px] w-3 shrink-0 text-[var(--blue)]">
                    {chosen ? (
                      <Check
                        className="size-3"
                        strokeWidth={2.5}
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 text-[12px] text-[var(--ink-900)]">
                    {name}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <p className="mx-1 mt-1 border-t border-[var(--border-hairline)] px-1.5 pt-2 pb-1 text-[11px] leading-[1.5] text-[var(--ink-400)]">
          {division ? `${division} conferences` : "Conferences"} from the
          program directory.
        </p>
      </PopoverContent>
    </Popover>
  );
}
