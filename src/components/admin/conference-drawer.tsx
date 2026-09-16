"use client";

import { PeekDrawerFrame } from "@/components/dashboard/matches/match-drawer";
import { conferenceMeta } from "@/lib/data/admin-conferences-view";
import type { AdminConferenceRow } from "@/lib/data/admin-conferences-view";

/**
 * PLACEHOLDER — T8 replaces this file in place with the real conference
 * drawer (edit fields, Teams section, merge, delete).
 *
 * It exists so `ConferencesPageContent` can wire the whole selection machine
 * now: the props below are the contract the page already drives, and the
 * shell is the shared 340px `PeekDrawerFrame`, so opening, stepping with ↑/↓,
 * the "Conference n / N" counter and Esc all work before the body does.
 */
export function ConferenceDrawer({
  row,
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
  row: AdminConferenceRow;
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
  /** Ran after any write lands — the page refreshes so the row agrees. */
  onChanged?: () => void;
}) {
  const meta = conferenceMeta(row);

  return (
    <PeekDrawerFrame
      kind="Conference"
      label={row.name}
      index={index}
      total={total}
      canPrev={canPrev}
      canNext={canNext}
      closing={closing}
      autoFocus={autoFocus}
      focusKey={row.id}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      footer={null}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-[22px] py-5">
        <h2 className="text-[16px] font-medium text-[var(--ink-900)]">
          {row.name}
        </h2>
        {meta && <p className="text-[12px] text-[var(--ink-600)]">{meta}</p>}
      </div>
    </PeekDrawerFrame>
  );
}
