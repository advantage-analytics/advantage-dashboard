"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { adminSearch } from "@/lib/data/admin-search-server";
import { SearchMark } from "@/components/admin/search/search-mark";
import {
  ADMIN_SEARCH_GROUPS,
  type AdminSearchHit,
} from "@/components/admin/search/types";
import { cn } from "@/lib/utils";

/**
 * The admin console's Search: teams, people, matches and conferences, from
 * anywhere under /admin.
 *
 * Matching lives in `public.admin_search` (accents, case and typos forgiven);
 * this draws the answer grouped by kind, each row a `Link` so a middle-click
 * opens it in a new tab the way every other row in the console does.
 *
 * Keyboard: ⌘K / ⌃K opens it (the header owns the binding — `chrome.md`
 * "One search per screen"), ↑/↓ move the active row, Enter opens it, Esc
 * closes. The field is a combobox whose `aria-activedescendant` names the
 * active option, so focus never leaves the field while the selection moves.
 * The trigger shows no keycap: the DS keeps `⌘K` in the dark tooltip only
 * ("Search trigger drops its keycap", `reference/chrome.md`).
 *
 * Each keystroke is debounced by 180ms and every reply is stamped with the
 * query that asked for it — a fast "UC" landing after a slow "U" would
 * otherwise repaint the list with the older answer.
 *
 * A search that fails answers its query with nothing and says so. Server
 * actions are queued one at a time per client, so several keystrokes'
 * searches can be waiting when the network drops or the page reloads; each of
 * those rejects (Safari: `TypeError: Load failed`), and without a handler
 * every one of them was an unhandled rejection and the list sat on
 * "Searching…" (PostHog 01a0f0a6, `tests/admin-search.spec.ts`).
 */

const DEBOUNCE_MS = 180;

const SEARCH_ERROR = "Couldn't search.";

const PLACEHOLDER = "Search teams, people, matches, conferences";

/** Platform for the tooltip's shortcut; null until the browser says. */
function subscribeNever() {
  return () => {};
}
function readIsMac(): boolean | null {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform: string } })
      .userAgentData?.platform ?? navigator.platform;
  return /mac|iphone|ipad/i.test(platform);
}

/** A field other than ours that ⌘K should be left alone in. */
function isOtherTextField(
  target: EventTarget | null,
  ours: HTMLElement | null,
): boolean {
  if (!(target instanceof HTMLElement) || target === ours) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export function AdminSearch() {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  // Results carry the query they answer, so "still searching" is derived
  // rather than a second piece of state — a `loading` flag would have to be
  // raised synchronously inside the effect below, which is the cascading
  // render `react-hooks/set-state-in-effect` is there to catch.
  const [answered, setAnswered] = useState<{
    query: string;
    rows: AdminSearchHit[];
    failed?: boolean;
  }>({ query: "", rows: [] });
  // The active row by key, not index, so a fresh answer that drops it falls
  // back to the first row instead of pointing at whatever slid into its slot.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The query the newest request was issued for; a reply for anything else is
  // stale and dropped.
  const latest = useRef("");
  const isMac = useSyncExternalStore(subscribeNever, readIsMac, () => null);

  useEffect(() => {
    const query = term.trim();
    latest.current = query;
    if (query.length === 0) return;

    const timer = setTimeout(() => {
      void adminSearch(query)
        .then(
          (rows) => ({ rows, failed: false }),
          // Answered with nothing, so "Searching…" ends, and says why. The
          // next keystroke searches again.
          () => ({ rows: [] as AdminSearchHit[], failed: true }),
        )
        .then(({ rows, failed }) => {
          if (latest.current !== query) return;
          setAnswered({ query, rows, failed });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  // Each opening starts empty — a console left open all day should not offer
  // yesterday's search as if it were current.
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTerm("");
      setAnswered({ query: "", rows: [] });
      setActiveKey(null);
    }
  };

  // ⌘K / ⌃K from anywhere in /admin. Left alone while someone is typing in
  // another field (a drawer's note, a filter's search), where the browser's
  // own binding or the field's is what they meant.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
        return;
      if (event.key.toLowerCase() !== "k") return;
      if (isOtherTextField(event.target, inputRef.current)) return;
      event.preventDefault();
      setOpen(true);
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const query = term.trim();
  const loading = answered.query !== query;
  const results = loading ? [] : answered.rows;
  const failed = !loading && answered.failed === true;

  // Display order: the four groups in a fixed order, each in the order the
  // function ranked it. Keyboard order is the same flat list.
  const groups = ADMIN_SEARCH_GROUPS.map((group) => ({
    ...group,
    rows: results.filter((row) => row.kind === group.kind),
  })).filter((group) => group.rows.length > 0);
  const ordered = groups.flatMap((group) => group.rows);
  const keyOf = (hit: AdminSearchHit) => `${hit.kind}:${hit.id}`;
  const optionId = (hit: AdminSearchHit) => `${listId}-${hit.kind}-${hit.id}`;
  const found = ordered.findIndex((hit) => keyOf(hit) === activeKey);
  const activeIndex = ordered.length === 0 ? -1 : found === -1 ? 0 : found;
  const active = activeIndex >= 0 ? ordered[activeIndex] : null;

  const onFieldKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (ordered.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = (activeIndex + step + ordered.length) % ordered.length;
      const hit = ordered[next];
      setActiveKey(keyOf(hit));
      document
        .getElementById(optionId(hit))
        ?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "Enter" && active) {
      event.preventDefault();
      changeOpen(false);
      router.push(active.href);
    }
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <ChromeTooltip
        label="Search"
        detail="Teams, people, matches, conferences"
        shortcut={isMac === null ? undefined : isMac ? "⌘K" : "⌃K"}
        hidden={open}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            aria-keyshortcuts="Meta+K Control+K"
            className="flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-element)] px-2 transition-colors duration-200 hover:bg-[var(--surface-subtle)]"
          >
            <Search
              className="size-3.5 text-[var(--ink-500)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="text-[12px] text-[var(--ink-600)]">Search</span>
          </button>
        </PopoverTrigger>
      </ChromeTooltip>

      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        aria-label="Search the admin console"
        className="w-[360px] p-1.5"
        onOpenAutoFocus={(event) => {
          // Focus the field, not the panel — the point of opening this is to
          // type.
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={query.length > 0 && ordered.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={onFieldKeyDown}
          placeholder={PLACEHOLDER}
          aria-label={PLACEHOLDER}
          className="h-8 w-full rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5 text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
        />

        {query.length > 0 &&
          (ordered.length === 0 ? (
            <p
              role="status"
              className="mt-1 px-2.5 py-3 text-[12px] text-[var(--ink-500)]"
            >
              {loading
                ? "Searching…"
                : failed
                  ? SEARCH_ERROR
                  : `No results for “${query}”`}
            </p>
          ) : (
            <div
              id={listId}
              role="listbox"
              aria-label="Results"
              className="mt-1 flex max-h-[min(420px,60vh)] flex-col overflow-y-auto"
            >
              {groups.map((group) => (
                <div
                  key={group.kind}
                  role="group"
                  aria-labelledby={`${listId}-${group.kind}`}
                >
                  {/* The menu rule: 11px ink-400 sentence case, never an
                      eyebrow (chrome.md, search palette group labels). */}
                  <p
                    id={`${listId}-${group.kind}`}
                    className="px-2.5 pt-2 pb-1 text-[11px] text-[var(--ink-400)]"
                  >
                    {group.label}
                  </p>
                  {group.rows.map((hit) => {
                    const isActive =
                      active !== null && keyOf(hit) === keyOf(active);
                    return (
                      <Link
                        key={keyOf(hit)}
                        id={optionId(hit)}
                        role="option"
                        aria-selected={isActive}
                        href={hit.href}
                        tabIndex={-1}
                        onMouseMove={() => {
                          if (!isActive) setActiveKey(keyOf(hit));
                        }}
                        onClick={() => changeOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-[7px] px-2.5 py-[6px] transition-colors duration-100",
                          isActive && "bg-[var(--surface-subtle)]",
                        )}
                      >
                        <SearchMark hit={hit} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[12px] text-[var(--ink-900)]">
                            {hit.title}
                          </span>
                          {hit.subtitle ? (
                            <span className="mt-0.5 truncate text-[11px] text-[var(--ink-500)]">
                              {hit.subtitle}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
      </PopoverContent>
    </Popover>
  );
}
