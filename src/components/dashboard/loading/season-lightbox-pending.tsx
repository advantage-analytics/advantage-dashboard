"use client";

import { useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { CUT_LABEL } from "@/components/dashboard/matches/match-detail/shots/viz-labels";
import type { Cut } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { PendingBar, PendingRegion } from "./pending";

/**
 * The season lightbox while its court is on its way (`season-viz-lightbox.tsx`):
 * `VizLightboxShell`'s frame — the same overlay, the same box, the same
 * header and two columns (`viz-lightbox-shell.tsx`) — with a bar wherever a
 * figure or a word will land. Carbon's loading pattern as the rest of
 * `loading/` draws it: one `role="status"` for the region, labelled with the
 * cut the reader asked for ("Loading Serve placement"), every bar
 * `aria-hidden`, the skeleton token, a pulse and never a spinner.
 *
 * The one thing drawn as itself is Close: the reader opened this and may
 * want out before the server answers, so Esc, the overlay and the button
 * all reach `onClose` — a Radix dialog, as the shell is, so focus is held
 * the same way and the hand-off to the shell is one dialog for another.
 * Focus lands on the title, as in the shell: left to Radix it would land on
 * Close, whose tooltip would open and take the first Esc for itself.
 *
 * The title is a bar, not the cut's name: the shell titles the card's own
 * name ("First serves") while the court holds the card's filters and the
 * cut's ("Serve placement") once a filter is loosened, and that rule is the
 * server's to apply (`buildSeasonLightbox`). The dialog's accessible name
 * carries the cut instead.
 */
export function SeasonLightboxPending({
  cut,
  onClose,
}: {
  cut: Cut;
  onClose: () => void;
}) {
  const label = CUT_LABEL[cut];
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(13,13,13,0.4)] data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="season-lightbox-pending"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            titleRef.current?.focus();
          }}
          className="fixed top-[clamp(16px,10dvh,96px)] left-1/2 z-50 flex h-[min(880px,calc(100dvh-clamp(16px,10dvh,96px)-32px))] w-[min(1212px,calc(100vw-32px))] -translate-x-1/2 flex-col rounded-[14px] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
        >
          <TooltipProvider>
            <DialogPrimitive.Title
              ref={titleRef}
              tabIndex={-1}
              className="sr-only outline-none"
            >
              {`Loading ${label}`}
            </DialogPrimitive.Title>

            {/* ── Header: the title's 16px line and the subtitle's 12px ── */}
            <div className="flex items-start gap-2.5 px-6 pt-6 pb-5">
              <div aria-hidden="true" className="flex min-w-0 flex-col gap-1">
                <div className="flex h-[22px] items-center">
                  <PendingBar className="h-3 w-36" />
                </div>
                <div className="flex h-[18px] items-center">
                  <PendingBar className="h-2.5 w-64" />
                </div>
              </div>
              <span className="flex-1" />
              {/* An Esc while the Close tooltip is open is the tooltip's
                  first; it hands it on, as the shell's does. */}
              <ChromeTooltip
                label="Close"
                shortcut="Esc"
                align="end"
                onEscapeKeyDown={onClose}
              >
                <DialogPrimitive.Close
                  aria-label="Close"
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area"
                >
                  <X className="size-3.5" strokeWidth={1.5} aria-hidden />
                </DialogPrimitive.Close>
              </ChromeTooltip>
            </div>

            {/* ── Body: the court column and the Statistics column ─────── */}
            <PendingRegion
              label={label}
              className="flex min-h-0 flex-1 flex-col"
              innerClassName="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-6 md:flex-row"
            >
              <div className="flex min-w-0 shrink-0 flex-col gap-3 md:min-h-0 md:max-w-[800px] md:flex-1 md:shrink">
                {/* The control row: You | Opponent and Filters, 26px chips. */}
                <div className="flex min-h-7 items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
                  <div className="flex gap-1.5">
                    <PendingBar className="h-[26px] w-[50px] rounded-[var(--radius-pill)]" />
                    <PendingBar className="h-[26px] w-[82px] rounded-[var(--radius-pill)]" />
                  </div>
                  <PendingBar className="h-[26px] w-[72px] rounded-[var(--radius-pill)]" />
                </div>
                {/* The court stage, at the stage's own height rule. */}
                <PendingBar className="h-[420px] w-full shrink-0 rounded-[10px] md:h-auto md:min-h-[360px] md:flex-1 md:shrink" />
                {/* The legend's keys. */}
                <div className="flex h-4 items-center gap-x-[14px]">
                  <PendingBar className="h-2.5 w-10" />
                  <PendingBar className="h-2.5 w-10" />
                  <PendingBar className="h-2.5 w-12" />
                  <PendingBar className="h-2.5 w-14" />
                </div>
              </div>
              <div className="flex w-full shrink-0 flex-col md:ml-auto md:min-h-0 md:w-[340px]">
                <div className="flex min-h-7 items-center border-b border-[var(--border-hairline)] pb-3">
                  <PendingBar className="h-[26px] w-[78px] rounded-[var(--radius-pill)]" />
                </div>
                {/* Two groups of rows, as `LightboxStats` lays them out. */}
                <div className="flex flex-col gap-6 pt-5">
                  {[3, 4].map((rows, group) => (
                    <div key={group} className="flex flex-col">
                      <div className="flex h-5 items-center pb-1.5">
                        <PendingBar className="h-2 w-16" />
                      </div>
                      {Array.from({ length: rows }, (_, row) => (
                        <div
                          key={row}
                          className="flex h-7 items-center justify-between gap-3"
                        >
                          <PendingBar className="h-2.5 w-24" />
                          <PendingBar className="h-2.5 w-10" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </PendingRegion>
            <div aria-hidden="true" className="h-6 shrink-0" />
          </TooltipProvider>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
