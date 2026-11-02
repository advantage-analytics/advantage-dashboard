"use client";

import Link from "next/link";
import { StatePill } from "@/components/ui/state-pill";
import { AnalysisStatusLine } from "@/components/dashboard/shared/analysis-status-line";
import {
  UNTITLED_DRAFT,
  draftTitle,
  stepLabel,
} from "@/lib/wizard/draft-row-fields";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { draftHref, type DraftRowData } from "./draft-row";
import { matchCardId } from "./match-card-gallery";

/**
 * DraftCard — `DraftRow`'s twin below `lg`, where the table gives way to cards.
 *
 * What the draft has answered and the step it stopped at, in the match card's
 * chrome. A tap peeks like a row click, so Continue is the rail's footer
 * primary and not a second link in here; ⌘-click still goes straight back into
 * the wizard.
 */
export function DraftCard({
  draft,
  scope,
  onOpen,
}: {
  draft: DraftRowData;
  scope: "personal" | "team";
  /** Open the drawer on this card; `viaKeyboard` moves focus into it. */
  onOpen?: (viaKeyboard: boolean) => void;
}): React.JSX.Element {
  const title = draftTitle(draft, scope) ?? UNTITLED_DRAFT;

  return (
    <Link
      href={draftHref(draft.id, scope)}
      id={onOpen ? matchCardId(draft.id) : undefined}
      aria-label={`${title}, draft`}
      onClick={(event) => {
        if (
          !onOpen ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        // A click with no pointer behind it (`detail` 0) is Enter on the link.
        onOpen(event.detail === 0);
      }}
      className="flex w-full flex-col gap-3 rounded-[14px] border border-[#F3F3F3] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] duration-200 hover:border-[#E5E5EA] hover:shadow-[0px_6px_20px_0px_rgba(0,0,0,0.10)] focus-visible:outline-none"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="eyebrow min-w-0 truncate">
          {draft.eventLabel ?? "No event yet"}
        </span>
        {draft.matchDate && (
          <span className="text-micro tabular shrink-0">
            {formatMatchDayShortYear(draft.matchDate)}
          </span>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
          {title}
        </span>
        <StatePill outline className="shrink-0">
          Draft
        </StatePill>
      </span>
      <AnalysisStatusLine mark="wait">
        {stepLabel(draft.step, draft.providerKind)}
      </AnalysisStatusLine>
    </Link>
  );
}
