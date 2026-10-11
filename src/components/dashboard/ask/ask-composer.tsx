"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, AtSign, X } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useListboxNav } from "@/hooks/use-listbox-nav";
import type { AskTagOptions } from "@/lib/data/ask-tags";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import {
  ASK_TAG_ICON,
  ASK_TAG_MENU_LABEL,
  AskTagMenu,
  askTagKey,
  askTagRows,
  askTagToken,
  flatAskTagRows,
  type AskTagRow,
} from "./ask-tag-menu";
import { AskEngineMark } from "./ask-engine-mark";
import type { AskQuestion, AskTag } from "./use-ask-stream";

/**
 * How many questions are spent, as the composer and the rail are handed it.
 * `resetsOn` (`YYYY-MM-DD`) is null when only a stream's `done` has reported
 * the count and the page's own read of the quota failed.
 */
export interface AskQuotaView {
  used: number;
  cap: number;
  resetsOn: string | null;
}

export interface AskComposerProps {
  /** The draft, held by the thread so a failed question can come back. */
  value: AskQuestion;
  onChange: (value: AskQuestion) => void;
  /** Send `value`. Only called when there is something to send and room to. */
  onSubmit: () => void;
  /** What `@` can tag: the viewer's personal matches and their opponents. */
  tagOptions: AskTagOptions;
  /** Null when the count could not be read; the route still decides. */
  quota: AskQuotaView | null;
  /** An answer is in flight. */
  pending: boolean;
}

export const ASK_PLACEHOLDER =
  "Ask about a match, an opponent or a stretch of the season. Type @ to tag one.";

/** `2026-11-01` → `Nov 1`; null for a date that cannot be read. */
function resetDateLabel(resetsOn: string | null): string | null {
  if (!resetsOn) return null;
  const date = new Date(`${resetsOn}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Where a question is written: the textarea, the tags on it, and one row of
 * controls — tag, the engine's name, the month's count, Send.
 *
 * ── Tagging ─────────────────────────────────────────────────────────────────
 * `@` at the start of a word opens the tag menu, and what is typed after it
 * narrows the list; so does the "Tag a match or opponent" button, which types
 * the `@` for the player and leaves the caret after it. One path, so the
 * button and the keystroke cannot drift apart. Choosing a row turns the
 * `@text` into a chip: the text goes, the tag is added, the caret stays put.
 *
 * Focus never leaves the textarea while the menu is open. Arrow keys move the
 * active row (named to a screen reader through `aria-activedescendant`),
 * Enter chooses it, Escape closes the menu and leaves the text as typed.
 * With the menu closed, Enter sends and Shift+Enter breaks the line.
 *
 * ── The limit ───────────────────────────────────────────────────────────────
 * At `used >= cap` Send is disabled and the count says when it comes back.
 * The textarea stays editable: a question refused at the limit returns to the
 * draft, and a draft the player cannot select or copy is a draft they have
 * lost. `quota` null means the count could not be read — the composer works
 * and shows no count, never an invented `0 / 20`.
 *
 * ── The engine ──────────────────────────────────────────────────────────────
 * "Advantage Intelligence" is a label, deliberately: no chevron, no menu, not
 * a button. A menu with one row is a control that does nothing; it becomes
 * one when there is a second engine to choose.
 *
 * Keep this file's imports clear of `next/navigation` and `next/image`: it is
 * rendered by an offline component harness (`tests/ask-composer.spec.ts`).
 */
export function AskComposer({
  value,
  onChange,
  onSubmit,
  tagOptions,
  quota,
  pending,
}: AskComposerProps) {
  const inputId = useId();
  const listId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Where the caret is, as last reported by the textarea. The `@` token is
  // read against it, so text before an earlier `@` never opens the menu.
  const [caret, setCaret] = useState(value.text.length);
  // The menu is wanted: an `@` was typed, or the button was pressed.
  const [tagging, setTagging] = useState(false);
  // The `@` Escape was pressed on. Typing on in the same word must not bring
  // the menu straight back; a new `@` does.
  const [dismissed, setDismissed] = useState<number | null>(null);
  // A caret position to restore once an edit made here has rendered.
  const pendingCaret = useRef<number | null>(null);

  const token = askTagToken(value.text, caret);
  const rows = askTagRows(tagOptions, token?.query ?? "");
  const flat = flatAskTagRows(rows);
  // "@anna" with no Anna says so. "@ home I lost in three" is a sentence
  // that happens to start with an `@`: once there is a space and nothing
  // matches, the menu steps aside rather than sit there saying no.
  const showable =
    token !== null && !(flat.length === 0 && /\s/.test(token.query));
  const open = tagging && showable;

  const atLimit = quota !== null && quota.used >= quota.cap;
  const canSend = value.text.trim() !== "" && !pending && !atLimit;
  const resets = atLimit ? resetDateLabel(quota.resetsOn) : null;

  const chosen = new Set(value.tags.map(askTagKey));

  function dismiss() {
    setTagging(false);
    if (token) setDismissed(token.start);
  }

  function choose(row: AskTagRow) {
    if (!token) return;
    const before = value.text.slice(0, token.start);
    let after = value.text.slice(Math.min(caret, value.text.length));
    // Taking a word out of the middle of a sentence leaves two spaces.
    if (/(^|\s)$/.test(before) && after.startsWith(" ")) after = after.slice(1);

    onChange({
      text: before + after,
      tags: chosen.has(askTagKey(row.tag))
        ? value.tags
        : [...value.tags, row.tag],
    });
    pendingCaret.current = before.length;
    setCaret(before.length);
    setTagging(false);
    setDismissed(null);
    textarea.current?.focus();
  }

  const {
    activeIndex,
    setActiveIndex,
    optionId,
    onKeyDown: onListKeyDown,
  } = useListboxNav({
    count: flat.length,
    open,
    onSelect: (index) => {
      const row = flat[index];
      if (row) choose(row);
    },
    onDismiss: dismiss,
    idPrefix: listId,
  });

  // After an edit made here — the button's `@`, a chosen row's removed text —
  // the browser would leave the caret at the end of the new value.
  useLayoutEffect(() => {
    const position = pendingCaret.current;
    if (position === null) return;
    pendingCaret.current = null;
    textarea.current?.setSelectionRange(position, position);
  }, [value.text]);

  // `useListboxNav` leaves scrolling to the caller. The menu is portalled, so
  // the row is found by id rather than through a ref on the list.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, optionId]);

  function submit() {
    if (!canSend) return;
    setTagging(false);
    onSubmit();
  }

  function onTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value;
    const position = event.target.selectionEnd ?? text.length;
    const next = askTagToken(text, position);
    setCaret(position);
    if (next === null) {
      setTagging(false);
      setDismissed(null);
    } else if (next.start !== dismissed) {
      setTagging(true);
    }
    onChange({ ...value, text });
  }

  /** The caret moved without the text changing: arrows, a click, a drag. */
  function onCaretMove(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const position = event.currentTarget.selectionEnd ?? value.text.length;
    setCaret(position);
    // Leaving the `@word` closes the menu; arriving in one does not open it.
    if (askTagToken(value.text, position) === null) setTagging(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter that confirms an IME composition is not a send.
    if (event.nativeEvent.isComposing) return;

    if (open) {
      if (event.key === "Tab") {
        dismiss();
        return;
      }
      // Home and End belong to the line being typed, not to the list.
      if (event.key === "Home" || event.key === "End") return;
      // A line break ends the `@word`, which closes the menu by itself.
      if (event.key === "Enter" && event.shiftKey) return;
      if (flat.length === 0) {
        // Nothing to choose. Escape still closes it, and Enter must not send
        // a question out from under an open menu.
        if (event.key === "Escape") {
          event.preventDefault();
          dismiss();
        } else if (event.key === "Enter") {
          event.preventDefault();
        }
        return;
      }
      onListKeyDown(event);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function onTagButton(event: React.MouseEvent<HTMLButtonElement>) {
    // The menu's open state is this component's; keep Radix's toggle out.
    event.preventDefault();
    textarea.current?.focus();
    if (open) {
      dismiss();
      return;
    }
    if (showable) {
      // An `@word` is already under the caret (Escape closed it): reopen.
      setDismissed(null);
      setTagging(true);
      return;
    }
    // Type the `@` for them, as its own word.
    const at = Math.min(caret, value.text.length);
    const lead = at > 0 && !/\s/.test(value.text[at - 1]) ? " " : "";
    const position = at + lead.length + 1;
    onChange({
      ...value,
      text: `${value.text.slice(0, at)}${lead}@${value.text.slice(at)}`,
    });
    pendingCaret.current = position;
    setCaret(position);
    setDismissed(null);
    setTagging(true);
  }

  function removeTag(tag: AskTag) {
    onChange({
      ...value,
      tags: value.tags.filter((other) => askTagKey(other) !== askTagKey(tag)),
    });
    textarea.current?.focus();
  }

  return (
    <TooltipProvider>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        // The box is what reads as the field, so the ring is the box's — keyed
        // on the textarea, because the chips' buttons ring themselves.
        className="flex flex-col gap-2.5 rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 pt-3 pb-2.5 has-[textarea:focus-visible]:shadow-[var(--focus-ring-field)]"
      >
        {value.tags.length > 0 && (
          <ul aria-label="Tagged" className="flex flex-wrap gap-1.5">
            {value.tags.map((tag) => {
              const Icon = ASK_TAG_ICON[tag.kind];
              return (
                <li
                  key={askTagKey(tag)}
                  className="flex h-[22px] items-center gap-[5px] rounded-[var(--radius-button)] bg-[var(--surface-subtle)] pr-0.5 pl-1.5 text-[12px] text-[var(--ink-900)]"
                >
                  <Icon
                    className="size-3 shrink-0 text-[var(--ink-500)]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  {tag.label}
                  <ChromeTooltip label="Remove" side="top">
                    <button
                      type="button"
                      aria-label={`Remove ${tag.label}`}
                      onClick={() => removeTag(tag)}
                      className="flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)]"
                    >
                      <X
                        className="size-[11px]"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </button>
                  </ChromeTooltip>
                </li>
              );
            })}
          </ul>
        )}

        <label htmlFor={inputId} className="sr-only">
          Your question
        </label>
        <textarea
          ref={textarea}
          id={inputId}
          rows={2}
          value={value.text}
          placeholder={ASK_PLACEHOLDER}
          onChange={onTextChange}
          onSelect={onCaretMove}
          onKeyDown={onKeyDown}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={
            open && flat.length > 0 ? optionId(activeIndex) : undefined
          }
          data-focus-ring="none"
          className="[field-sizing:content] max-h-40 min-h-[39px] w-full resize-none border-0 bg-transparent px-0.5 text-[13px] leading-[1.5] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
        />

        <div className="flex flex-wrap items-center gap-2">
          <AskTagMenu
            open={open}
            onOpenChange={(next) => {
              if (!next) dismiss();
            }}
            listId={listId}
            rows={rows}
            query={token?.query ?? ""}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            optionId={optionId}
            onChoose={choose}
            chosen={chosen}
            trigger={
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={onTagButton}
                className={cn(
                  "-ml-1 flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-element)] px-2 text-[12px] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]",
                  open
                    ? "bg-[var(--surface-subtle)] text-[var(--ink-900)]"
                    : "text-[var(--ink-600)]",
                )}
              >
                <AtSign
                  className="size-3.5 text-[var(--ink-500)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                {ASK_TAG_MENU_LABEL}
              </button>
            }
          />

          {/* A label. Not a button, no chevron: there is one engine. */}
          <span
            data-ask-engine=""
            className="flex items-center gap-2 text-[12px] text-[var(--ink-700)]"
          >
            <AskEngineMark />
            Advantage Intelligence
          </span>

          <div className="flex-1" />

          {quota && (
            <p
              data-ask-count=""
              className="font-mono text-[11px] text-[var(--ink-600)] tabular-nums"
            >
              <span className="sr-only">Questions asked this month: </span>
              {quota.used} / {quota.cap}
              {resets && quota.resetsOn && (
                <>
                  {" · Resets "}
                  <time dateTime={quota.resetsOn}>{resets}</time>
                </>
              )}
            </p>
          )}

          <ChromeTooltip label="Send question" shortcut="↵" side="top">
            <button
              type="submit"
              aria-label="Send question"
              disabled={!canSend}
              className={cn(advButton("primary", "sm"), "w-8 px-0")}
            >
              <ArrowUp
                className="size-3.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          </ChromeTooltip>
        </div>
      </form>
    </TooltipProvider>
  );
}
