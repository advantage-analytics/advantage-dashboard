"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Calendar, FileText, MoreHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatePill } from "@/components/ui/state-pill";
import { deleteMatchDraft } from "@/lib/wizard/actions";
import { formatShortDate } from "@/lib/ui/date-format";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { ICON_BUTTON, PeekDrawerFrame } from "./match-drawer";
import { draftHref, type DraftRowData } from "./draft-row";

/**
 * A saved draft, in the same rail a match opens in.
 *
 * A draft row peeks like every other row on the page, so its actions have the
 * one home a match's have: Discard sits in the header's ⋯ with its consequence
 * spelled out, and the row itself carries no menu. The body says what exists
 * so far — the name, the event, when it was last touched and the file it
 * holds — and how far through the wizard it stopped. The footer's one primary
 * is "Continue", the wizard's own word for the next step.
 *
 * No ghost "Open" as a match has: there is no page to open but the wizard, and
 * that is the primary. The name is the same link, as a match's name is.
 */
export function DraftDrawer({
  draft,
  scope,
  index,
  total,
  canPrev,
  canNext,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
}: {
  draft: DraftRowData;
  scope: "personal" | "team";
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const href = draftHref(draft.id, scope);
  const title = draft.playerName ?? "Untitled match";

  const facts = [
    { icon: Calendar, text: `Edited ${formatShortDate(draft.updatedAt)}` },
    draft.fileName ? { icon: FileText, text: draft.fileName } : null,
  ].filter((fact) => fact !== null);

  return (
    <PeekDrawerFrame
      kind="Draft"
      label={`${title}, draft`}
      index={index}
      total={total}
      canPrev={canPrev}
      canNext={canNext}
      closing={closing}
      autoFocus={autoFocus}
      focusKey={draft.id}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      actions={<DiscardMenu key={draft.id} draftId={draft.id} />}
      footer={
        <Link href={href} className={cn(advButton("primary", "md"), "w-full")}>
          Continue
        </Link>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[22px] pt-6 pb-[22px]">
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-2">
            <h2 className="text-title-lg min-w-0">
              <Link
                href={href}
                className="rounded-[var(--radius-cell)] [text-wrap:balance] text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                {title}
              </Link>
            </h2>
            <StatePill outline className="mt-[5px] shrink-0">
              Draft
            </StatePill>
          </div>
          <p className="text-[12px] leading-[1.5] text-[var(--ink-600)]">
            {draft.eventLabel ?? "No event yet"}
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-3.5 whitespace-nowrap">
          {facts.map(({ icon: Icon, text }) => (
            <span key={text} className="flex min-w-0 items-center gap-[5px]">
              <Icon
                className="size-[13px] shrink-0 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="mono tabular min-w-0 truncate text-[11px] text-[var(--ink-600)]">
                {text}
              </span>
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-4">
          <span className="text-[12px] text-[var(--ink-700)]">
            Stopped at step {draft.stepIndex + 1} of {draft.stepCount}
          </span>
          <p className="text-[12px] leading-[1.6] text-[var(--ink-500)]">
            It isn&rsquo;t a match until you save it. Continue picks up where
            you left off.
          </p>
        </div>
      </div>
    </PeekDrawerFrame>
  );
}

/** The header's ⋯ — Discard, with what it costs said beside it. */
function DiscardMenu({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const discard = () => {
    setOpen(false);
    startTransition(async () => {
      await deleteMatchDraft(draftId);
      router.refresh();
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Draft actions"
        disabled={pending}
        className={cn(
          ICON_BUTTON,
          "data-[state=open]:bg-[var(--surface-subtle)] data-[state=open]:text-[var(--ink-700)]",
        )}
      >
        <MoreHorizontal className="size-3.5" strokeWidth={1.75} aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="flex w-[280px] flex-col rounded-[var(--radius-dropdown)] border-[var(--border-hairline)] bg-white p-1.5 shadow-[var(--shadow-dropdown)]"
      >
        <button
          type="button"
          onClick={discard}
          className="flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5 text-left transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
        >
          <span className="text-[12px] font-medium text-[var(--danger)]">
            Discard
          </span>
          <span className="text-[11px] text-[var(--ink-500)]">
            the answers go; a video already sent stays
          </span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
