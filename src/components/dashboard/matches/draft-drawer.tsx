"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  Calendar,
  Clock,
  FileText,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { StatePill } from "@/components/ui/state-pill";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { formatShortDate } from "@/lib/ui/date-format";
import { advButton } from "@/lib/ui/adv-button";
import {
  UNTITLED_DRAFT,
  draftTitle,
  stepLabel,
} from "@/lib/wizard/draft-row-fields";
import { capitalize, cn } from "@/lib/utils";
import { ICON_BUTTON, PeekDrawerFrame } from "./match-drawer";
import { DrawerFact, ProviderFact } from "./drawer-sections";
import { StepIndicator } from "./new-match-wizard/StepIndicator";
import { draftHref, type DraftRowData } from "./draft-row";
import { DiscardDraftDialog } from "./discard-draft-dialog";
import {
  DESTRUCTIVE_ICON,
  DESTRUCTIVE_ROW,
  MENU_ROW_ICON,
} from "./match-actions/menu-row-classes";

/**
 * A saved draft, in the same rail a match opens in.
 *
 * A draft row peeks like every other row on the page, so its actions have the
 * one home a match's have: "Discard draft" sits in the header's ⋯, confirmed
 * in a dialog like the match's Delete beside it, and the row itself carries
 * no menu.
 *
 * The body reads the draft back the way the match rail reads a match. Its
 * name is the match's — "vs Opponent" here, "Player vs Opponent" on a team —
 * as the wizard link, with the outlined Draft pill; then the event label; the
 * wizard's own step bar with the step it stopped at named, not counted; and
 * the facts as `DrawerFact` rows — the match day, the court, the source, the
 * file and when it was last edited. A fact not yet answered reads muted
 * ("No date yet"), never as a blank. The file line says the file must be
 * picked again: a draft holds its name, never the file, which lives only in
 * the browser that picked it. The footer's one primary is "Continue", the
 * wizard's own word for the next step.
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
  const router = useRouter();
  const href = draftHref(draft.id, scope);
  const name = draftTitle(draft, scope);
  const title = name ?? UNTITLED_DRAFT;

  // The rail leaves the way Esc closes it, and only then does the list drop
  // the row: a refresh that landed mid-slide would unmount the drawer in
  // place (the page's "record left the list" branch), with no slide at all.
  const discarded = () => {
    onClose();
    window.setTimeout(() => router.refresh(), DISCARD_REFRESH_DELAY_MS);
  };

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
      actions={
        <DiscardMenu
          key={draft.id}
          draftId={draft.id}
          matchName={name}
          onDiscarded={discarded}
        />
      }
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

        {/* Where it stopped — the wizard's own bar, done and current in blue,
            and the step named rather than counted. The count keeps its place
            at the right, in mono, for the person who thinks in steps. */}
        <div className="flex flex-col gap-2">
          <StepIndicator
            currentStep={draft.stepIndex}
            totalSteps={draft.stepCount}
          />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] text-[var(--ink-700)]">
              Stopped at {stepLabel(draft.step, draft.providerKind)}
            </span>
            <span className="mono tabular text-[11px] text-[var(--ink-400)]">
              {draft.stepIndex + 1} / {draft.stepCount}
            </span>
          </div>
        </div>

        <dl className="flex min-w-0 flex-col gap-0.5 text-left">
          <DrawerFact label="Date" icon={<Calendar />} muted={!draft.matchDate}>
            {draft.matchDate ? (
              <span className="tabular">
                {formatMatchDayShortYear(draft.matchDate)}
              </span>
            ) : (
              "No date yet"
            )}
          </DrawerFact>
          <DrawerFact
            label="Court"
            muted={!draft.courtType}
            icon={
              <Image
                src="/icons/tennis-court-icon.svg"
                alt=""
                width={16}
                height={16}
              />
            }
          >
            {draft.courtType ? capitalize(draft.courtType) : "Not specified"}
          </DrawerFact>
          <ProviderFact providerId={draft.providerId} />
          <DrawerFact label="File" icon={<FileText />} muted={!draft.fileName}>
            {draft.fileName ? (
              <>
                {draft.fileName}
                <span className="text-[var(--ink-400)]">
                  {" "}
                  · Pick again on Continue
                </span>
              </>
            ) : (
              "No file yet"
            )}
          </DrawerFact>
          <DrawerFact label="Last edited" icon={<Clock />} muted>
            Edited {formatShortDate(draft.updatedAt)}
          </DrawerFact>
        </dl>
      </div>
    </PeekDrawerFrame>
  );
}

/**
 * Past the rail's 200ms slide-out (`roster-drawer-out`) and the page's own
 * 240ms fallback for it (`closeDrawer`, for reduced motion), so the refresh
 * that drops the row never cuts the slide short.
 */
const DISCARD_REFRESH_DELAY_MS = 240;

/**
 * The header's ⋯ — one row, "Discard draft", on the same `FloatMenu` the
 * match's Edit · Delete and the event's menu draw: 13px `Trash2` in ink-400,
 * grey at rest and `--danger` on hover or focus, with the tooltip every
 * icon-only control in the chrome answers hover with. The row opens the
 * confirm; nothing is deleted from the menu itself.
 */
function DiscardMenu({
  draftId,
  matchName,
  onDiscarded,
}: {
  draftId: string;
  matchName: string | null;
  onDiscarded: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const discardedRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <ChromeTooltip label="Draft actions" hidden={menuOpen || dialogOpen}>
        <span className="inline-flex">
          <FloatMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            width={220}
            label="Draft actions"
            trigger={
              <button
                ref={triggerRef}
                type="button"
                aria-label="Draft actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={cn(
                  ICON_BUTTON,
                  "data-[state=open]:bg-[var(--surface-subtle)] data-[state=open]:text-[var(--ink-700)]",
                )}
              >
                <MoreHorizontal
                  className="size-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </button>
            }
          >
            <FloatMenuItem
              label="Discard draft"
              description="Clears your saved answers"
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
                setDialogOpen(true);
              }}
            />
          </FloatMenu>
        </span>
      </ChromeTooltip>

      <DiscardDraftDialog
        draftId={draftId}
        matchName={matchName}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onDiscarded={() => {
          discardedRef.current = true;
          onDiscarded();
        }}
        onCloseAutoFocus={(event) => {
          // Back to the ⋯ on Keep draft; after a discard the rail is leaving
          // and `closeDrawer` has already put focus on the row.
          event.preventDefault();
          if (discardedRef.current) {
            discardedRef.current = false;
            return;
          }
          triggerRef.current?.focus();
        }}
      />
    </>
  );
}
