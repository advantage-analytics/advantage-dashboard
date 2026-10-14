"use client";

import { useEffect, useRef, useState, type MouseEvent, type Ref } from "react";
import Link from "next/link";
import {
  PanelLeftClose,
  PanelLeftOpen,
  SquarePen,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  ConfirmDialog,
  ConfirmProse,
  Em,
} from "@/components/ui/confirm-dialog";
import { Kbd } from "@/components/ui/kbd";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AskConversationSummary } from "@/lib/data/ask-server";
import {
  PERSONAL_ASK_SCOPE,
  askBasePath,
  type AskScope,
} from "@/lib/services/ask/scope";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import type { AskQuotaView } from "./ask-composer";
import { ASK_FEEDBACK_KEPT } from "./ask-feedback";
import { askDayLabel, askMonthGroups } from "./ask-earlier";
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
  /** Earlier questions asked in this scope, most recently used first. */
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
   * An answer is in flight. Deleting re-reads the page from the server, which
   * can rebuild the thread under an answer that is still arriving, so the row
   * action waits for it.
   */
  deleteDisabled?: boolean;
}

/** Where the viewer's choice of open or closed is kept, per device. */
export const ASK_RAIL_STORAGE_KEY = "advantage:ask-rail";

/**
 * The Ask page's left rail: "New question", the questions asked so far by
 * month, and what is left of the month's allowance at the foot.
 *
 * It is the `<nav>` itself, width included, because open or closed is the
 * viewer's own choice: 280px open, a 52px strip of two icon buttons closed.
 * The choice lives in this component's state and in `localStorage`. It
 * renders open on the server and on first paint — the stored value is read
 * in an effect, so the two renders agree — and it changes on a click only;
 * nothing here opens under a passing cursor.
 *
 * The list is the only part that scrolls: the head and the limit stay put.
 * An empty list says so in one line; a count that could not be read drops
 * the foot rather than print numbers nobody measured.
 *
 * "New question" and the delete arrive as props, not an imported router or
 * server action, and the links are `next/link`: keep this file's imports
 * clear of `next/navigation`, because it is rendered by an offline component
 * harness (`tests/ask-rail.spec.ts`).
 */
export function AskRail({
  quota,
  conversations,
  scope = PERSONAL_ASK_SCOPE,
  timeZone,
  activeConversationId,
  onNewQuestion,
  onDeleteConversation,
  deleteDisabled = false,
}: AskRailProps) {
  const [open, setOpen] = useState(true);
  // The width eases only once the viewer has toggled it: the stored choice
  // arriving after first paint should land, not perform.
  const [toggled, setToggled] = useState(false);
  const [mac, setMac] = useState(true);

  useEffect(() => {
    setMac(isMacPlatform(navigator.platform || navigator.userAgent));
    try {
      if (localStorage.getItem(ASK_RAIL_STORAGE_KEY) === "closed") {
        setOpen(false);
      }
    } catch {
      // Private mode or blocked storage — open is a fine default.
    }
  }, []);

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
    const next = !open;
    setOpen(next);
    setToggled(true);
    try {
      localStorage.setItem(ASK_RAIL_STORAGE_KEY, next ? "open" : "closed");
    } catch {
      // A per-device convenience, never load-bearing.
    }
  }

  const keys = newQuestionKeys(mac);
  const keyShortcuts = mac ? "Meta+Shift+O" : "Control+Shift+O";

  return (
    <TooltipProvider>
      <nav
        aria-label="Earlier questions"
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
                <span className="flex-1 text-left">New question</span>
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
                label="Hide earlier questions"
                icon={PanelLeftClose}
                side="bottom"
                expanded
                onClick={toggle}
              />
            </div>

            <div
              data-ask-rail-list=""
              className={cn(ASK_SCROLL, "flex flex-col gap-5 px-3 pt-2 pb-4")}
            >
              {conversations.length > 0 ? (
                <AskEarlier
                  conversations={conversations}
                  timeZone={timeZone}
                  basePath={askBasePath(scope)}
                  activeConversationId={activeConversationId}
                  onDeleteConversation={onDeleteConversation}
                  deleteDisabled={deleteDisabled}
                />
              ) : (
                <p data-ask-rail-empty="" className="text-body-sm px-2">
                  Questions you ask are kept here.
                </p>
              )}
            </div>

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
              label="Show earlier questions"
              icon={PanelLeftOpen}
              expanded={false}
              onClick={toggle}
            />
            <RailIconButton
              label="New question"
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
  const used = Math.min(Math.max(quota.used, 0), quota.cap);
  const left = quota.cap - used;

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
          {used} / {quota.cap}
        </p>
      </div>
      <span
        role="img"
        aria-label={`${used} of ${quota.cap} questions used`}
        className="flex gap-[3px]"
      >
        {Array.from({ length: quota.cap }, (_, index) => (
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

// ── Earlier questions ───────────────────────────────────────────────────────

function AskEarlier({
  conversations,
  timeZone,
  basePath,
  activeConversationId,
  onDeleteConversation,
  deleteDisabled,
}: Pick<
  AskRailProps,
  "conversations" | "timeZone" | "activeConversationId" | "onDeleteConversation"
> & { basePath: string; deleteDisabled: boolean }) {
  // The row being asked about. Kept after the dialog closes so its title does
  // not blank out while the dialog is still leaving.
  const [target, setTarget] = useState<AskConversationSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    else setError("That question could not be deleted. Try again.");
  }

  return (
    <>
      {askMonthGroups(conversations, timeZone).map((group) => (
        <section
          key={group.key}
          data-ask-month={group.key}
          className="flex flex-col gap-0.5"
        >
          <h2 className="eyebrow-sm px-2 pb-1.5">{group.label}</h2>
          <ul className="flex flex-col gap-0.5">
            {group.rows.map((conversation) => (
              <AskEarlierRow
                key={conversation.id}
                conversation={conversation}
                timeZone={timeZone}
                basePath={basePath}
                active={conversation.id === activeConversationId}
                deleteDisabled={deleteDisabled}
                onDelete={() => {
                  setTarget(conversation);
                  setError(null);
                  setOpen(true);
                }}
              />
            ))}
          </ul>
        </section>
      ))}

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title="Delete this question?"
        description="Removes the question and every answer under it. There is no undo."
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
    </>
  );
}

/**
 * One line: the question, its date at the edge. Under the pointer, or once
 * focus is anywhere in the row, the date fades and delete takes its place —
 * the same 48px, so nothing in the row moves. On a screen with no hover the
 * delete is simply there.
 *
 * The edge sits over the link's right padding and lets a click through to
 * it, so the whole row opens the conversation except the button itself.
 */
function AskEarlierRow({
  conversation,
  timeZone,
  basePath,
  active,
  deleteDisabled,
  onDelete,
}: {
  conversation: AskConversationSummary;
  /** The zone the row's date is read in (`AskRailProps.timeZone`). */
  timeZone: string | undefined;
  /** The page this conversation belongs to (`askBasePath`). */
  basePath: string;
  active: boolean;
  deleteDisabled: boolean;
  onDelete: () => void;
}) {
  const askedOn = askDayLabel(conversation.updatedAt, timeZone);
  return (
    <li
      className={cn(
        "group relative flex h-9 items-center rounded-[var(--radius-element)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]",
        active && "bg-[var(--surface-subtle)]",
      )}
    >
      <Link
        href={`${basePath}?c=${conversation.id}`}
        aria-current={active ? "page" : undefined}
        className="flex h-full min-w-0 flex-1 items-center rounded-[var(--radius-element)] pr-14 pl-2"
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
            className="pr-1 font-mono text-[10px] whitespace-nowrap text-[var(--ink-500)] tabular-nums transition-opacity duration-200 group-focus-within:opacity-0 group-hover:opacity-0 [@media(hover:none)]:opacity-0"
          >
            {askedOn}
          </time>
        )}
        <ChromeTooltip label="Delete" side="top">
          <button
            type="button"
            aria-label={`Delete ${conversation.title}`}
            disabled={deleteDisabled}
            onClick={onDelete}
            className="pointer-events-auto absolute right-0 flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-button)] text-[var(--ink-500)] opacity-0 transition-[opacity,color,background-color] duration-200 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-[var(--surface-card)] hover:text-[var(--danger)] disabled:cursor-default disabled:text-[var(--text-disabled)] disabled:hover:bg-transparent [@media(hover:none)]:opacity-100"
          >
            <Trash2
              className="size-[13px]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        </ChromeTooltip>
      </span>
    </li>
  );
}
