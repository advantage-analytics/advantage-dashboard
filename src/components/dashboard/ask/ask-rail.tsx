"use client";

import {
  memo,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from "react";
import Link from "next/link";
import {
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Search,
  SquarePen,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  DESTRUCTIVE_ICON,
  DESTRUCTIVE_ROW,
  MENU_ROW_ICON,
} from "@/components/dashboard/matches/match-actions/menu-row-classes";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  ConfirmDialog,
  ConfirmProse,
  Em,
} from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
} from "@/components/ui/float-menu";
import { Kbd } from "@/components/ui/kbd";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AskConversationSummary } from "@/lib/data/ask-server";
import {
  PERSONAL_ASK_SCOPE,
  askBasePath,
  type AskScope,
} from "@/lib/services/ask/scope";
import { MAX_ASK_CONVERSATION_TITLE } from "@/lib/services/ask/titles";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import type { AskQuotaView } from "./ask-composer";
import { ASK_FEEDBACK_KEPT } from "./ask-feedback";
import {
  askConversationsMatching,
  askDayLabel,
  askMonthGroups,
  askPinnedFirst,
} from "./ask-earlier";
import {
  ASK_RAIL,
  ASK_RAIL_CLOSED,
  ASK_RAIL_OPEN,
  ASK_SCROLL,
} from "./ask-frame";
import { isMacPlatform, newQuestionKeys } from "./ask-shortcut";

export interface AskRailProps {
  /** Null when the count could not be read — never a made-up `0 / 20`. */
  quota: AskQuotaView | null;
  /** Earlier questions asked in this scope, pinned first, then most recently used first. */
  conversations: AskConversationSummary[];
  /**
   * Whose matches the page is about: a row opens its conversation on that
   * scope's own page. The personal page when omitted.
   */
  scope?: AskScope;
  /**
   * The IANA zone the months and row dates are read in: the workspace's
   * (`Workspace.timeZone`), the same string on the server and in the browser.
   * UTC when omitted or unknown (`ask-earlier.ts`).
   */
  timeZone?: string;
  /** The conversation that is open, so its row can say so. */
  activeConversationId: string | null;
  /** "New question": the button here, and the page's shortcut, run this. */
  onNewQuestion: () => void;
  /**
   * Delete one conversation. Resolves true once it is gone and false when it
   * could not be deleted; the list is the caller's, so a deleted row leaves
   * when `conversations` next arrives without it.
   */
  onDeleteConversation: (id: string) => Promise<boolean>;
  /**
   * Rename one conversation to `title` (already a line the player typed;
   * the action normalises it). Resolves true once saved.
   */
  onRenameConversation: (id: string, title: string) => Promise<boolean>;
  /** Pin one conversation to the top of the list, or take the pin off. */
  onPinConversation: (id: string, pinned: boolean) => Promise<boolean>;
  /**
   * An answer is in flight. Deleting re-reads the page from the server, which
   * can rebuild the thread under an answer that is still arriving, so the row
   * actions wait for it.
   */
  deleteDisabled?: boolean;
}

/** Where the viewer's choice of open or closed is kept, per device. */
export const ASK_RAIL_STORAGE_KEY = "advantage:ask-rail";

/** The filter field is drawn once the list is this long; fewer rows are scanned. */
export const ASK_RAIL_FILTER_MIN = 6;

/** Under this the rail is a bar across the top with its list in a sheet. */
export const ASK_RAIL_NARROW_QUERY = "(max-width: 767px)";

const RAIL_COPY = {
  landmark: "Earlier questions",
  newQuestion: "New question",
  hide: "Hide earlier questions",
  show: "Show earlier questions",
  empty: "Questions you ask are kept here.",
  filter: "Filter questions",
  noMatch: (query: string) => `No question matches “${query}”`,
  pinned: "Pinned",
  options: (title: string) => `Options for ${title}`,
  rename: "Rename",
  renameField: "Rename question",
  pin: "Pin to top",
  unpin: "Unpin",
  delete: "Delete",
  renameFailed: "That question could not be renamed. Try again.",
  pinFailed: "That question could not be pinned. Try again.",
  unpinFailed: "That question could not be unpinned. Try again.",
  pinnedDone: "Pinned",
  unpinnedDone: "Unpinned",
  deleteFailed: "That question could not be deleted. Try again.",
  close: "Close",
} as const;

/**
 * The Ask page's left rail: "New question", the questions asked so far —
 * pinned ones first, then by month — and what is left of the month's
 * allowance at the foot.
 *
 * It is the `<nav>` itself, width included, because open or closed is the
 * viewer's own choice: 280px open, a 52px strip of two icon buttons closed.
 * The choice lives in `localStorage` (and in memory where storage is
 * blocked), read through `useSyncExternalStore`. It renders open on the
 * server and while hydrating — the server snapshot — so the two renders
 * agree, and it changes on a click only; nothing here opens under a passing
 * cursor.
 *
 * The list is the only part that scrolls: the head and the limit stay put.
 * An empty list says so in one line; a count that could not be read drops
 * the foot rather than print numbers nobody measured.
 *
 * ── Rows ────────────────────────────────────────────────────────────────────
 * A row is its title. Under a month's heading the date is read, not drawn —
 * the heading already says when, and five rows that open alike need the
 * width to tell apart; a pinned row has no month above it and keeps its date
 * at the edge. Under the pointer, or once focus is in the row, a ⋯ takes
 * the date's place and opens the row's menu — Rename,
 * Pin to top (or Unpin), then Delete below a hairline. Rename is in place:
 * the title becomes a field, Enter saves, Escape leaves it as it was. A
 * list of six or more rows gets a filter field above it, over the titles it
 * already holds; nothing is asked of the server while typing.
 *
 * ── Under 768px ─────────────────────────────────────────────────────────────
 * The rail is a bar across the top of the frame — "Earlier questions" and
 * "New question" — and the list opens in a sheet from the left edge, on the
 * dialog primitive (focus, Escape and the scrim are its). The narrow case
 * is read from a media query with `useSyncExternalStore`: the server
 * snapshot is the panel, so a hydrating page agrees with the server and a
 * client navigation draws the bar straight away; the frame hides the panel
 * under 768px by CSS until the bar takes over (`ASK_RAIL`). Whether this is
 * a Mac (for the shortcut's keys) is read the same way, once, here.
 *
 * "New question", the delete, the rename and the pin arrive as props, not
 * an imported router or server action, and the links are `next/link`: keep
 * this file's imports clear of `next/navigation`, because it is rendered by
 * an offline component harness (`tests/ask-rail.spec.ts`).
 */
export const AskRail = memo(function AskRail(props: AskRailProps) {
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);
  const mac = useSyncExternalStore(subscribeNever, readMac, () => true);
  return narrow ? (
    <AskRailBar {...props} mac={mac} />
  ) : (
    <AskRailPanel {...props} mac={mac} />
  );
});

function subscribeNarrow(onChange: () => void) {
  const media = window.matchMedia(ASK_RAIL_NARROW_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readNarrow() {
  return window.matchMedia(ASK_RAIL_NARROW_QUERY).matches;
}

/** The platform does not change under a page: nothing to listen for. */
function subscribeNever() {
  return () => {};
}

function readMac() {
  return isMacPlatform(navigator.platform || navigator.userAgent);
}

// ── Open or closed, per device ──────────────────────────────────────────────

const railChoiceListeners = new Set<() => void>();
/** This visit's choice, for when storage is blocked and cannot hold it. */
let railChoice: "open" | "closed" | null = null;

function subscribeRailChoice(onChange: () => void) {
  railChoiceListeners.add(onChange);
  return () => {
    railChoiceListeners.delete(onChange);
  };
}

function readRailOpen(): boolean {
  if (railChoice !== null) return railChoice === "open";
  try {
    return localStorage.getItem(ASK_RAIL_STORAGE_KEY) !== "closed";
  } catch {
    // Private mode or blocked storage — open is a fine default.
    return true;
  }
}

function writeRailOpen(open: boolean) {
  railChoice = open ? "open" : "closed";
  try {
    localStorage.setItem(ASK_RAIL_STORAGE_KEY, railChoice);
  } catch {
    // A per-device convenience, never load-bearing.
  }
  for (const onChange of railChoiceListeners) onChange();
}

/** Read once in `AskRail` and handed down: ⇧⌘O on a Mac, Ctrl+Shift+O elsewhere. */
type AskRailViewProps = AskRailProps & { mac: boolean };

// ── The panel (768px and up) ────────────────────────────────────────────────

function AskRailPanel({
  quota,
  conversations,
  scope = PERSONAL_ASK_SCOPE,
  timeZone,
  activeConversationId,
  onNewQuestion,
  onDeleteConversation,
  onRenameConversation,
  onPinConversation,
  deleteDisabled = false,
  mac,
}: AskRailViewProps) {
  const open = useSyncExternalStore(
    subscribeRailChoice,
    readRailOpen,
    () => true,
  );
  // The width eases only once the viewer has toggled it: the stored choice
  // arriving after hydration should land, not perform.
  const [toggled, setToggled] = useState(false);

  // A toggle from the keyboard unmounts the button that had focus; hand it
  // to the button that replaced it. Not after a pointer click: there, focus
  // landing on the new button would only raise its tooltip.
  const toggleButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    toggleButton.current?.focus();
  }, [open]);

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    refocus.current = event.detail === 0;
    setToggled(true);
    writeRailOpen(!open);
  }

  const keys = newQuestionKeys(mac);
  const keyShortcuts = mac ? "Meta+Shift+O" : "Control+Shift+O";

  return (
    <TooltipProvider>
      <nav
        aria-label={RAIL_COPY.landmark}
        data-ask-rail={open ? "open" : "closed"}
        className={cn(
          ASK_RAIL,
          open ? ASK_RAIL_OPEN : ASK_RAIL_CLOSED,
          toggled &&
            "transition-[width] duration-200 ease-[var(--ease-primary)] motion-reduce:transition-none",
        )}
      >
        {open ? (
          // Laid out at the open width whatever the nav measures, so nothing
          // rewraps while the width eases.
          <div className={cn("flex min-h-0 flex-1 flex-col", ASK_RAIL_OPEN)}>
            <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
              <button
                type="button"
                onClick={onNewQuestion}
                aria-keyshortcuts={keyShortcuts}
                className={cn(
                  advButton("ghost", "sm"),
                  "min-w-0 flex-1 justify-start gap-2 px-2.5",
                )}
              >
                <SquarePen
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-[var(--ink-500)]"
                  strokeWidth={1.5}
                />
                <span className="flex-1 text-left">
                  {RAIL_COPY.newQuestion}
                </span>
                <span
                  aria-hidden="true"
                  data-ask-keys=""
                  className="flex items-center gap-0.5"
                >
                  {keys.map((key) => (
                    <Kbd key={key} size="sm" variant="flat">
                      {key}
                    </Kbd>
                  ))}
                </span>
              </button>
              <RailIconButton
                ref={toggleButton}
                label={RAIL_COPY.hide}
                icon={PanelLeftClose}
                side="bottom"
                expanded
                onClick={toggle}
              />
            </div>

            <AskRailBody
              conversations={conversations}
              timeZone={timeZone}
              basePath={askBasePath(scope)}
              activeConversationId={activeConversationId}
              onDeleteConversation={onDeleteConversation}
              onRenameConversation={onRenameConversation}
              onPinConversation={onPinConversation}
              deleteDisabled={deleteDisabled}
            />

            {quota && <AskLimit quota={quota} />}
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-3",
              ASK_RAIL_CLOSED,
            )}
          >
            <RailIconButton
              ref={toggleButton}
              label={RAIL_COPY.show}
              icon={PanelLeftOpen}
              expanded={false}
              onClick={toggle}
            />
            <RailIconButton
              label={RAIL_COPY.newQuestion}
              shortcut={keys.join(mac ? "" : " ")}
              keyShortcuts={keyShortcuts}
              icon={SquarePen}
              onClick={onNewQuestion}
            />
          </div>
        )}
      </nav>
    </TooltipProvider>
  );
}

// ── The bar and its sheet (under 768px) ─────────────────────────────────────

/** The dialog primitive's centred box, re-seated as a sheet on the left edge. */
const SHEET =
  "top-0 left-0 flex h-full w-[min(320px,86vw)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 border-r border-[var(--border-hairline)] p-0 shadow-[var(--shadow-dropdown)] data-[state=closed]:zoom-out-100 data-[state=closed]:slide-out-to-top-0 data-[state=closed]:slide-out-to-left-full data-[state=open]:zoom-in-100 data-[state=open]:slide-in-from-top-0 data-[state=open]:slide-in-from-left-full";

function AskRailBar({
  quota,
  conversations,
  scope = PERSONAL_ASK_SCOPE,
  timeZone,
  activeConversationId,
  onNewQuestion,
  onDeleteConversation,
  onRenameConversation,
  onPinConversation,
  deleteDisabled = false,
  mac,
}: AskRailViewProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const keyShortcuts = mac ? "Meta+Shift+O" : "Control+Shift+O";
  const count = conversations.length;

  return (
    <TooltipProvider>
      <nav
        aria-label={RAIL_COPY.landmark}
        data-ask-rail="bar"
        className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border-hairline)] px-3 py-2"
      >
        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          {/* The primitive's own trigger, so the sheet hands focus back to
              it on close; it sets the popup and expanded attributes. */}
          <DialogTrigger asChild>
            <button
              type="button"
              className={cn(advButton("ghost", "sm"), "min-w-0 gap-2 px-2.5")}
            >
              <PanelLeftOpen
                aria-hidden="true"
                className="size-3.5 shrink-0 text-[var(--ink-500)]"
                strokeWidth={1.5}
              />
              <span className="truncate">
                {RAIL_COPY.landmark}
                {/* A count in the words, never a badge: zero prints nothing. */}
                {count > 0 && (
                  <span className="text-[var(--ink-500)] tabular-nums">
                    {" · "}
                    {count}
                  </span>
                )}
              </span>
            </button>
          </DialogTrigger>
          <DialogContent hideCloseButton className={SHEET}>
            <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--border-hairline)] pr-2 pl-5">
              <DialogTitle className="text-left text-[12px] font-medium text-[var(--ink-900)]">
                {RAIL_COPY.landmark}
              </DialogTitle>
              <DialogDescription className="sr-only">
                The questions asked so far, pinned first and then by month.
              </DialogDescription>
              <div className="flex-1" />
              <button
                type="button"
                aria-label={RAIL_COPY.close}
                onClick={() => setSheetOpen(false)}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
            <AskRailBody
              conversations={conversations}
              timeZone={timeZone}
              basePath={askBasePath(scope)}
              activeConversationId={activeConversationId}
              onDeleteConversation={onDeleteConversation}
              onRenameConversation={onRenameConversation}
              onPinConversation={onPinConversation}
              deleteDisabled={deleteDisabled}
            />
            {quota && <AskLimit quota={quota} />}
          </DialogContent>
        </Dialog>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onNewQuestion}
          aria-keyshortcuts={keyShortcuts}
          className={cn(advButton("ghost", "sm"), "gap-2 px-2.5")}
        >
          <SquarePen
            aria-hidden="true"
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
          />
          {RAIL_COPY.newQuestion}
        </button>
      </nav>
    </TooltipProvider>
  );
}

// ── The list ────────────────────────────────────────────────────────────────

/**
 * The scrolling part of the rail, in the panel and in the sheet alike: the
 * filter field once the list is long enough, then the rows. An empty list
 * says so in one line; a filter that leaves nothing says what it was.
 */
function AskRailBody({
  conversations,
  timeZone,
  basePath,
  activeConversationId,
  onDeleteConversation,
  onRenameConversation,
  onPinConversation,
  deleteDisabled,
}: Pick<
  AskRailProps,
  | "conversations"
  | "timeZone"
  | "activeConversationId"
  | "onDeleteConversation"
  | "onRenameConversation"
  | "onPinConversation"
> & { basePath: string; deleteDisabled: boolean }) {
  const [query, setQuery] = useState("");
  const matching = askConversationsMatching(conversations, query);
  const filterable = conversations.length >= ASK_RAIL_FILTER_MIN;

  return (
    <div
      data-ask-rail-list=""
      className={cn(ASK_SCROLL, "flex flex-col gap-5 px-3 pt-2 pb-4")}
    >
      {filterable && (
        <label className="flex h-8 shrink-0 items-center gap-2 rounded-[var(--radius-element)] border border-[var(--border-field)] px-2.5 has-[input:focus-visible]:shadow-[var(--focus-ring-field)]">
          <Search
            aria-hidden="true"
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
          />
          <span className="sr-only">{RAIL_COPY.filter}</span>
          <input
            type="text"
            value={query}
            placeholder={RAIL_COPY.filter}
            autoComplete="off"
            spellCheck={false}
            data-focus-ring="none"
            data-ask-rail-filter=""
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query !== "") {
                event.preventDefault();
                setQuery("");
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
          />
          {query !== "" && (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setQuery("")}
              className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)]"
            >
              <X className="size-3" strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}
        </label>
      )}

      {conversations.length === 0 ? (
        <p data-ask-rail-empty="" className="text-body-sm shrink-0 px-2">
          {RAIL_COPY.empty}
        </p>
      ) : matching.length === 0 ? (
        <p
          data-ask-rail-nomatch=""
          role="status"
          className="text-body-sm shrink-0 px-2"
        >
          {RAIL_COPY.noMatch(query.trim())}
        </p>
      ) : (
        <AskEarlier
          conversations={matching}
          timeZone={timeZone}
          basePath={basePath}
          activeConversationId={activeConversationId}
          onDeleteConversation={onDeleteConversation}
          onRenameConversation={onRenameConversation}
          onPinConversation={onPinConversation}
          deleteDisabled={deleteDisabled}
        />
      )}
    </div>
  );
}

function RailIconButton({
  ref,
  label,
  shortcut,
  keyShortcuts,
  icon: Icon,
  side = "right",
  expanded,
  onClick,
}: {
  ref?: Ref<HTMLButtonElement>;
  label: string;
  /** Beside the label in the tooltip. */
  shortcut?: string;
  keyShortcuts?: string;
  icon: LucideIcon;
  side?: "right" | "bottom";
  /** Set on the pair that opens and closes the rail. */
  expanded?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <ChromeTooltip label={label} shortcut={shortcut} side={side}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={expanded}
        aria-keyshortcuts={keyShortcuts}
        onClick={onClick}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
      >
        <Icon aria-hidden="true" className="size-[15px]" strokeWidth={1.5} />
      </button>
    </ChromeTooltip>
  );
}

// ── The limit ───────────────────────────────────────────────────────────────

/**
 * The month's allowance, at the foot of the rail where it is always in reach
 * and never between the player and an answer: what is left as the sentence,
 * the count beside it, and one segment per question as the picture.
 *
 * The meter is one image to a screen reader — twenty segments read one by one
 * say nothing — and its label is the sentence the segments draw, so the count
 * beside it is hidden from one. A count past the cap is drawn as a full meter
 * and "0 questions left", never a negative.
 *
 * "Resets on the 1st" is the rule, not a computed date: the allowance is per
 * calendar month.
 */
function AskLimit({ quota }: { quota: AskQuotaView }) {
  if (quota.cap === null) return <AskUnlimited used={quota.used} />;
  const cap = quota.cap;
  const used = Math.min(Math.max(quota.used, 0), cap);
  const left = cap - used;

  return (
    <div
      data-ask-rail="limit"
      className="flex flex-col gap-2 border-t border-[var(--border-hairline)] px-5 pt-3.5 pb-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p
          data-ask-left=""
          className="text-[12px] text-[var(--ink-900)] tabular-nums"
        >
          {left} {left === 1 ? "question" : "questions"} left
        </p>
        <p
          data-ask-count=""
          aria-hidden="true"
          className="font-mono text-[10px] text-[var(--ink-500)] tabular-nums"
        >
          {used} / {cap}
        </p>
      </div>
      <span
        role="img"
        aria-label={`${used} of ${cap} questions used`}
        className="flex gap-[3px]"
      >
        {Array.from({ length: cap }, (_, index) => (
          <span
            key={index}
            data-ask-unit={index < used ? "used" : "left"}
            className={cn(
              "h-1 flex-1 rounded-[1px]",
              index < used ? "bg-[var(--blue)]" : "bg-[var(--ink-100)]",
            )}
          />
        ))}
      </span>
      <p className="text-[11px] text-[var(--ink-500)]">Resets on the 1st</p>
    </div>
  );
}

/**
 * A platform admin's allowance: no limit, so no meter and nothing left to
 * count down — only how many have been asked this month, which is still
 * counted (each one is a model call someone pays for).
 */
function AskUnlimited({ used }: { used: number }) {
  return (
    <div
      data-ask-rail="limit"
      className="flex flex-col gap-1 border-t border-[var(--border-hairline)] px-5 pt-3.5 pb-4"
    >
      <p data-ask-left="" className="text-[12px] text-[var(--ink-900)]">
        Unlimited questions
      </p>
      <p className="text-[11px] text-[var(--ink-500)] tabular-nums">
        {Math.max(used, 0)} asked this month
      </p>
    </div>
  );
}

// ── Earlier questions ───────────────────────────────────────────────────────

function AskEarlier({
  conversations,
  timeZone,
  basePath,
  activeConversationId,
  onDeleteConversation,
  onRenameConversation,
  onPinConversation,
  deleteDisabled,
}: Pick<
  AskRailProps,
  | "conversations"
  | "timeZone"
  | "activeConversationId"
  | "onDeleteConversation"
  | "onRenameConversation"
  | "onPinConversation"
> & { basePath: string; deleteDisabled: boolean }) {
  // The row being asked about. Kept after the dialog closes so its title does
  // not blank out while the dialog is still leaving.
  const [target, setTarget] = useState<AskConversationSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The row whose title is a field right now.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // What the last rename or pin had to say when it failed.
  const [notice, setNotice] = useState<string | null>(null);
  // The row whose pin is on its way to the server, and what the last one
  // that landed said — read out by a status region that is always mounted,
  // so the words are announced rather than mounted already holding them.
  const [pendingPinId, setPendingPinId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // A pinned row moves to another group, so React mounts it anew and the
  // focus its ⋯ held drops to the page. Handed back once the list shows it.
  const list = useRef<HTMLDivElement>(null);
  const refocusPin = useRef<{ id: string; pinned: boolean } | null>(null);
  useEffect(() => {
    const target = refocusPin.current;
    if (!target) return;
    const moved = conversations.find((row) => row.id === target.id);
    if (!moved || (moved.pinnedAt !== null) !== target.pinned) return;
    refocusPin.current = null;
    // Only focus that fell to the page; never pull it from where it was put.
    const active = document.activeElement;
    if (active && active !== document.body) return;
    list.current
      ?.querySelector<HTMLElement>(
        `[data-ask-row="${CSS.escape(target.id)}"] button[aria-haspopup="menu"]`,
      )
      ?.focus();
  }, [conversations]);

  async function confirmDelete() {
    if (!target || pending) return;
    setPending(true);
    setError(null);
    let deleted = false;
    try {
      deleted = await onDeleteConversation(target.id);
    } catch {
      deleted = false;
    }
    setPending(false);
    if (deleted) setOpen(false);
    else setError(RAIL_COPY.deleteFailed);
  }

  async function rename(id: string, title: string): Promise<boolean> {
    setNotice(null);
    let renamed = false;
    try {
      renamed = await onRenameConversation(id, title);
    } catch {
      renamed = false;
    }
    if (!renamed) setNotice(RAIL_COPY.renameFailed);
    return renamed;
  }

  async function pin(id: string, pinned: boolean) {
    if (pendingPinId !== null) return;
    setNotice(null);
    setAnnouncement("");
    setPendingPinId(id);
    refocusPin.current = { id, pinned };
    let done = false;
    try {
      done = await onPinConversation(id, pinned);
    } catch {
      done = false;
    }
    setPendingPinId(null);
    if (done) {
      setAnnouncement(pinned ? RAIL_COPY.pinnedDone : RAIL_COPY.unpinnedDone);
    } else {
      refocusPin.current = null;
      setNotice(pinned ? RAIL_COPY.pinFailed : RAIL_COPY.unpinFailed);
    }
  }

  const { pinned, rest } = askPinnedFirst(conversations);
  const sections = [
    ...(pinned.length > 0
      ? [{ key: "pinned", label: RAIL_COPY.pinned, rows: pinned }]
      : []),
    ...askMonthGroups(rest, timeZone),
  ];

  // A month's heading already says when; only a pinned row draws its date.
  const row = (conversation: AskConversationSummary, dated: boolean) => (
    <AskEarlierRow
      key={conversation.id}
      conversation={conversation}
      timeZone={timeZone}
      basePath={basePath}
      dated={dated}
      active={conversation.id === activeConversationId}
      actionsDisabled={deleteDisabled}
      pinPending={conversation.id === pendingPinId}
      renaming={conversation.id === renamingId}
      onStartRename={() => {
        setNotice(null);
        setRenamingId(conversation.id);
      }}
      onEndRename={() => setRenamingId(null)}
      onRename={(title) => rename(conversation.id, title)}
      onPin={() => void pin(conversation.id, conversation.pinnedAt === null)}
      onDelete={() => {
        setTarget(conversation);
        setError(null);
        setOpen(true);
      }}
    />
  );

  return (
    // `contents`: the sections stay children of the scroller's own column.
    <div ref={list} className="contents">
      {sections.map((group) => (
        <section
          key={group.key}
          data-ask-month={group.key}
          className="flex shrink-0 flex-col gap-0.5"
        >
          <h2 className="eyebrow-sm px-2 pb-1.5">{group.label}</h2>
          <ul className="flex flex-col gap-0.5">
            {group.rows.map((conversation) =>
              row(conversation, group.key === "pinned"),
            )}
          </ul>
        </section>
      ))}

      <p role="status" className="sr-only">
        {announcement}
      </p>
      {notice && (
        <p
          role="alert"
          className="shrink-0 px-2 text-[11px] text-[var(--danger-text)]"
        >
          {notice}
        </p>
      )}

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title="Delete this question?"
        description="Removes the question and every answer from your history. There is no undo."
        tone="danger"
        confirmLabel="Delete question"
        pendingLabel="Deleting…"
        pending={pending}
        error={error}
        onConfirm={() => void confirmDelete()}
      >
        {target && (
          <ConfirmProse>
            <p>
              <Em>{target.title}</Em> leaves Earlier questions. What it used of{" "}
              <Em>this month’s questions</Em> stays used.
            </p>
            <p>{ASK_FEEDBACK_KEPT}</p>
          </ConfirmProse>
        )}
      </ConfirmDialog>
    </div>
  );
}

/**
 * One line: the question, and — in the pinned group, which has no month
 * above it — its date at the edge. Under the pointer, or once focus is
 * anywhere in the row, the date fades and the row's ⋯ takes its place — the
 * same 48px, so nothing in the row moves. Under a month the date is read but
 * not drawn, and the title runs to the ⋯'s edge. On a screen with no hover
 * the ⋯ is simply there.
 *
 * The edge sits over the link's right padding and lets a click through to
 * it, so the whole row opens the conversation except the button itself.
 * While the row is being renamed, the link is a field in the same place.
 */
function AskEarlierRow({
  conversation,
  timeZone,
  basePath,
  dated,
  active,
  actionsDisabled,
  pinPending,
  renaming,
  onStartRename,
  onEndRename,
  onRename,
  onPin,
  onDelete,
}: {
  conversation: AskConversationSummary;
  /** The zone the row's date is read in (`AskRailProps.timeZone`). */
  timeZone: string | undefined;
  /** The page this conversation belongs to (`askBasePath`). */
  basePath: string;
  /** Draw the date at the edge (pinned rows); otherwise it is read only. */
  dated: boolean;
  active: boolean;
  actionsDisabled: boolean;
  /** This row's pin is on its way: Pin / Unpin waits for it. */
  pinPending: boolean;
  renaming: boolean;
  onStartRename: () => void;
  onEndRename: () => void;
  /** Save the typed title; resolves true once saved. */
  onRename: (title: string) => Promise<boolean>;
  onPin: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const askedOn = askDayLabel(conversation.updatedAt, timeZone);
  const pinned = conversation.pinnedAt !== null;

  return (
    <li
      data-ask-row={conversation.id}
      data-ask-pinned={pinned || undefined}
      className={cn(
        "group relative flex h-9 items-center rounded-[var(--radius-element)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]",
        active && "bg-[var(--surface-subtle)]",
      )}
    >
      {renaming ? (
        <RenameField
          title={conversation.title}
          onRename={onRename}
          onEnd={onEndRename}
        />
      ) : (
        <>
          <Link
            href={`${basePath}?c=${conversation.id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-full min-w-0 flex-1 items-center rounded-[var(--radius-element)] pl-2",
              dated ? "pr-14" : "pr-9",
            )}
          >
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[12px]",
                active
                  ? "font-medium text-[var(--ink-900)]"
                  : "text-[var(--ink-700)]",
              )}
            >
              {conversation.title}
            </span>
          </Link>
          <span className="pointer-events-none absolute inset-y-0 right-1 flex w-12 items-center justify-end">
            {askedOn && (
              <time
                dateTime={conversation.updatedAt}
                className={cn(
                  dated
                    ? "pr-1 font-mono text-[10px] whitespace-nowrap text-[var(--ink-500)] tabular-nums transition-opacity duration-200 group-focus-within:opacity-0 group-hover:opacity-0 [@media(hover:none)]:opacity-0"
                    : "sr-only",
                  dated && menuOpen && "opacity-0",
                )}
              >
                {askedOn}
              </time>
            )}
            <ChromeTooltip label="Options" side="top" hidden={menuOpen}>
              <span className="pointer-events-auto absolute right-0 inline-flex">
                <FloatMenu
                  open={menuOpen}
                  onOpenChange={setMenuOpen}
                  width={196}
                  align="end"
                  label={RAIL_COPY.options(conversation.title)}
                  trigger={
                    <button
                      type="button"
                      aria-label={RAIL_COPY.options(conversation.title)}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      disabled={actionsDisabled}
                      className={cn(
                        "flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-button)] text-[var(--ink-500)] opacity-0 transition-[opacity,color,background-color] duration-200 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-[var(--surface-card)] hover:text-[var(--ink-900)] disabled:cursor-default disabled:text-[var(--text-disabled)] disabled:hover:bg-transparent [@media(hover:none)]:opacity-100",
                        menuOpen && "opacity-100",
                      )}
                    >
                      <MoreHorizontal
                        className="size-[13px]"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </button>
                  }
                >
                  <FloatMenuItem
                    label={RAIL_COPY.rename}
                    icon={
                      <Pencil
                        className={MENU_ROW_ICON}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    }
                    onSelect={() => {
                      setMenuOpen(false);
                      onStartRename();
                    }}
                  />
                  <FloatMenuItem
                    label={pinned ? RAIL_COPY.unpin : RAIL_COPY.pin}
                    disabled={pinPending}
                    icon={
                      pinned ? (
                        <PinOff
                          className={MENU_ROW_ICON}
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      ) : (
                        <Pin
                          className={MENU_ROW_ICON}
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      )
                    }
                    onSelect={() => {
                      setMenuOpen(false);
                      onPin();
                    }}
                  />
                  <FloatMenuDivider />
                  <FloatMenuItem
                    label={RAIL_COPY.delete}
                    icon={
                      <Trash2
                        className={cn(MENU_ROW_ICON, DESTRUCTIVE_ICON)}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    }
                    className={DESTRUCTIVE_ROW}
                    onSelect={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  />
                </FloatMenu>
              </span>
            </ChromeTooltip>
          </span>
        </>
      )}
    </li>
  );
}

/**
 * The title as a field, in the row's own place: Enter saves, Escape leaves
 * the title as it was, and leaving the field saves a change or drops a
 * non-change. The field keeps the row's 12px and sits on the row's wash;
 * the limit is the column's.
 */
function RenameField({
  title,
  onRename,
  onEnd,
}: {
  title: string;
  onRename: (title: string) => Promise<boolean>;
  onEnd: () => void;
}) {
  const [value, setValue] = useState(title);
  const [pending, setPending] = useState(false);
  // Escape ends the edit before the field blurs; the blur must not then save.
  const cancelled = useRef(false);
  const field = useRef<HTMLInputElement>(null);

  async function submit() {
    if (pending) return;
    const next = value.trim();
    if (next === "" || next === title.trim()) {
      onEnd();
      return;
    }
    setPending(true);
    const saved = await onRename(next);
    setPending(false);
    if (saved) onEnd();
    // Refused: the field stays, with the caret, for another try.
    else if (document.activeElement === document.body) field.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelled.current = true;
      onEnd();
    }
  }

  return (
    <form
      className="flex h-full min-w-0 flex-1 items-center px-1"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        ref={field}
        autoFocus
        type="text"
        value={value}
        aria-label={RAIL_COPY.renameField}
        maxLength={MAX_ASK_CONVERSATION_TITLE}
        // Read-only, not disabled, while saving: a disabled field drops the
        // focus it holds, and the screen reader with it.
        readOnly={pending}
        aria-busy={pending || undefined}
        data-focus-ring="none"
        data-ask-rename=""
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (cancelled.current) return;
          void submit();
        }}
        className="h-7 w-full min-w-0 rounded-[var(--radius-element)] border border-[var(--border-field)] bg-[var(--surface-card)] px-1.5 text-[12px] text-[var(--ink-900)] outline-none read-only:text-[var(--text-disabled)] focus-visible:shadow-[var(--focus-ring-field)]"
      />
    </form>
  );
}
