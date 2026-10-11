"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  ConfirmDialog,
  ConfirmProse,
  Em,
} from "@/components/ui/confirm-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AskConversationSummary } from "@/lib/data/ask-server";
import type { AskTagOptions } from "@/lib/data/ask-tags";
import { cn } from "@/lib/utils";
import type { AskQuotaView } from "./ask-composer";
import { ASK_TAG_ICON, askTagKey, askTagMeta } from "./ask-tag-menu";
import type { AskTag } from "./use-ask-stream";

export interface AskRailProps {
  /**
   * "Tagged in this question": the draft's tags while there are any,
   * otherwise the last question's. Empty when neither has one.
   */
  tags: AskTag[];
  /** What can be tagged, for the line under each tag's name. */
  tagOptions: AskTagOptions;
  /** Null when the count could not be read — never a made-up `0 / 20`. */
  quota: AskQuotaView | null;
  /** "Earlier questions", most recently used first. */
  conversations: AskConversationSummary[];
  /** The conversation that is open, so its row can say so. */
  activeConversationId: string | null;
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

/**
 * The Ask page's right rail: what the question is tagged with, how much of
 * the month's allowance is spent, and the conversations saved so far.
 *
 * Each section is absent when it has nothing to say — no tag, a count that
 * could not be read, no saved conversation — rather than drawn empty: the
 * rail is context for the thread, and a heading over nothing is not context.
 *
 * The page shell owns the `<aside>`, its 340px width and its hairline; this
 * renders only what goes inside. The delete arrives as a prop, not an
 * imported server action, and the links are `next/link`: keep this file's
 * imports clear of `next/navigation`, because it is rendered by an offline
 * component harness (`tests/ask-rail.spec.ts`).
 */
export function AskRail({
  tags,
  tagOptions,
  quota,
  conversations,
  activeConversationId,
  onDeleteConversation,
  deleteDisabled = false,
}: AskRailProps) {
  return (
    <TooltipProvider>
      {tags.length > 0 && (
        <section data-ask-rail="tags" className="flex flex-col gap-0.5">
          <h2 className="eyebrow-sm pb-2">Tagged in this question</h2>
          <ul className="flex flex-col gap-0.5">
            {tags.map((tag) => {
              const Icon = ASK_TAG_ICON[tag.kind];
              return (
                <li
                  key={askTagKey(tag)}
                  className="flex min-h-[38px] items-center gap-2.5"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-[22px] shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[var(--ink-600)]"
                  >
                    <Icon className="size-[13px]" strokeWidth={1.5} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[12px] font-medium text-[var(--ink-900)]">
                      {tag.label}
                    </span>
                    <span className="text-[11px] text-[var(--ink-500)] tabular-nums">
                      {askTagMeta(tagOptions, tag)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {quota && <AskLimit quota={quota} />}

      {conversations.length > 0 && (
        <AskEarlier
          conversations={conversations}
          activeConversationId={activeConversationId}
          onDeleteConversation={onDeleteConversation}
          deleteDisabled={deleteDisabled}
        />
      )}
    </TooltipProvider>
  );
}

// ── The limit ───────────────────────────────────────────────────────────────

/**
 * The month's allowance: what is left as the headline, one unit per question
 * as the picture, and the count beside when it comes back.
 *
 * The meter is one image to a screen reader — twenty squares read one by one
 * say nothing — and its label is the sentence the squares draw. A count past
 * the cap is drawn as a full meter and "0 questions left", never a negative.
 *
 * "Resets on the 1st" is the rule, not a computed date: the allowance is per
 * calendar month. Capitalised because a line joined by middots is sentence
 * case per segment (`reference/primitives.md`, "Copy conventions").
 */
function AskLimit({ quota }: { quota: AskQuotaView }) {
  const used = Math.min(Math.max(quota.used, 0), quota.cap);
  const left = quota.cap - used;

  return (
    <section data-ask-rail="limit" className="flex flex-col gap-2.5">
      <h2 className="eyebrow-sm">Questions this month</h2>
      <p data-ask-left="" className="text-title-lg tabular-nums">
        {left} {left === 1 ? "question" : "questions"} left
      </p>
      <span
        role="img"
        aria-label={`${used} of ${quota.cap} questions used`}
        className="flex flex-wrap gap-[3px]"
      >
        {Array.from({ length: quota.cap }, (_, index) => (
          <span
            key={index}
            data-ask-unit={index < used ? "used" : "left"}
            className={cn(
              "size-2 rounded-[2px]",
              index < used
                ? "bg-[var(--blue)]"
                : "shadow-[inset_0_0_0_1px_var(--ink-300)]",
            )}
          />
        ))}
      </span>
      {/* The meter above already says this to a screen reader. */}
      <p
        data-ask-count=""
        aria-hidden="true"
        className="font-mono text-[11px] text-[var(--ink-600)] tabular-nums"
      >
        {used} / {quota.cap}
        {" · Resets on the 1st"}
      </p>
    </section>
  );
}

// ── Earlier questions ───────────────────────────────────────────────────────

/** `2026-09-28T…` → `Sep 28`, with the year when it is not `currentYear`. */
function askedOnLabel(updatedAt: string, currentYear: string | null) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  // UTC, so the server's render and the browser's agree on the day.
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: updatedAt.slice(0, 4) === currentYear ? undefined : "numeric",
    timeZone: "UTC",
  });
}

function AskEarlier({
  conversations,
  activeConversationId,
  onDeleteConversation,
  deleteDisabled,
}: Pick<
  AskRailProps,
  "conversations" | "activeConversationId" | "onDeleteConversation"
> & { deleteDisabled: boolean }) {
  // The row being asked about. Kept after the dialog closes so its title does
  // not blank out while the dialog is still leaving.
  const [target, setTarget] = useState<AskConversationSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The list arrives newest first, so its first row names "this year": an
  // older conversation carries its year and the rest stay short.
  const currentYear = conversations[0]?.updatedAt.slice(0, 4) ?? null;

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
    <section data-ask-rail="earlier" className="flex flex-col gap-0.5">
      <h2 className="eyebrow-sm pb-2">Earlier questions</h2>
      <ul className="flex flex-col gap-0.5">
        {conversations.map((conversation) => {
          const active = conversation.id === activeConversationId;
          const askedOn = askedOnLabel(conversation.updatedAt, currentYear);
          return (
            <li
              key={conversation.id}
              className={cn(
                "group -mx-2 flex h-9 items-center rounded-[var(--radius-element)] pr-1 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]",
                active && "bg-[var(--surface-subtle)]",
              )}
            >
              <Link
                href={`/dashboard/ask?c=${conversation.id}`}
                aria-current={active ? "page" : undefined}
                className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-element)] pr-1 pl-2"
              >
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
                  {conversation.title}
                </span>
                {askedOn && (
                  <time
                    dateTime={conversation.updatedAt}
                    className="shrink-0 font-mono text-[10px] text-[var(--ink-500)] tabular-nums"
                  >
                    {askedOn}
                  </time>
                )}
              </Link>
              <ChromeTooltip label="Delete" side="top">
                <button
                  type="button"
                  aria-label={`Delete ${conversation.title}`}
                  disabled={deleteDisabled}
                  onClick={() => {
                    setTarget(conversation);
                    setError(null);
                    setOpen(true);
                  }}
                  // Revealed by the row: under the pointer, or once focus is
                  // anywhere in it. Always there on a screen with no hover.
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] opacity-0 transition-[opacity,color] duration-200 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-[var(--danger)] disabled:cursor-default disabled:text-[var(--text-disabled)] [@media(hover:none)]:opacity-100"
                >
                  <Trash2
                    className="size-3.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>
              </ChromeTooltip>
            </li>
          );
        })}
      </ul>

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
          </ConfirmProse>
        )}
      </ConfirmDialog>
    </section>
  );
}
