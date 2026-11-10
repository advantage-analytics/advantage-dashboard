"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  LIGHTBOX_BOX_CLASS,
  LIGHTBOX_CLOSE_CLASS,
  LIGHTBOX_OVERLAY_CLASS,
} from "@/components/dashboard/matches/match-detail/shots/lightbox-frame";
import { PendingBar, PendingRegion } from "./pending";

/**
 * The lightbox while its court is on its way — Carbon's loading pattern as
 * the rest of `loading/` draws it: one `role="status"` for the region,
 * labelled with the cut asked for ("Loading Serve placement"), every bar
 * `aria-hidden`, the skeleton token, a pulse and never a spinner.
 *
 * Three pieces are the shell's own (`viz-lightbox-shell.tsx`, `pending`):
 * `LightboxTitlePending` inside its Title, `LightboxSubtitlePending` inside
 * its subtitle, `LightboxBodyPending` in place of its two columns. The
 * dialog itself — scrim, box, close, focus — is the shell's, and stays
 * mounted when the court lands, so the opener's focus return, the scrim
 * and the reader's place are one opening's.
 *
 * `LightboxChunkPending` is the fourth: the same frame drawn by hand for the
 * moment before the shell's chunk has loaded (`season-viz-lightbox.tsx`,
 * once per session). A modal dialog in its own right, since a scrim that
 * Tab can walk behind is not one: it takes focus on mount and keeps Tab
 * inside (Close is its one control), and as it leaves — for the shell, or
 * on Esc — it hands focus back to the element that had it, the clicked
 * card, which is what the shell then records as its opener. Esc closes it
 * unless a Radix layer is open above it (a header menu, a tooltip), which
 * keeps the key, as the shell's own rule has it.
 *
 * The title is a bar, not the cut's name: the shell titles the card's own
 * name ("First serves") while the court holds the card's filters and the
 * cut's ("Serve placement") once a filter is loosened, and that rule is the
 * server's to apply (`buildSeasonLightbox`). The accessible name carries the
 * cut instead.
 */

export function LightboxTitlePending({ label }: { label: string }) {
  return (
    <>
      <span className="sr-only">{`Loading ${label}`}</span>
      <span aria-hidden="true" className="flex h-[22px] items-center">
        <PendingBar className="h-3 w-36" />
      </span>
    </>
  );
}

export function LightboxSubtitlePending() {
  return (
    <span aria-hidden="true" className="flex h-[18px] items-center">
      <PendingBar className="h-2.5 w-64" />
    </span>
  );
}

/** The two columns: the court column's control row, stage and legend; the
 *  right column's chip and two groups of rows, as `LightboxStats` lays them
 *  out. */
export function LightboxBodyPending({ label }: { label: string }) {
  return (
    <PendingRegion
      label={label}
      className="flex min-h-0 flex-1 flex-col"
      innerClassName="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-6 md:flex-row"
    >
      <div className="flex min-w-0 shrink-0 flex-col gap-3 md:min-h-0 md:max-w-[800px] md:flex-1 md:shrink">
        <div className="flex min-h-7 items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
          <div className="flex gap-1.5">
            <PendingBar className="h-[26px] w-[50px] rounded-[var(--radius-pill)]" />
            <PendingBar className="h-[26px] w-[82px] rounded-[var(--radius-pill)]" />
          </div>
          <PendingBar className="h-[26px] w-[72px] rounded-[var(--radius-pill)]" />
        </div>
        {/* The court's stand-in: what a card's court grows into while the
            court is on its way (`viz-court-morph.ts`). */}
        <div
          data-court-morph-target=""
          className="flex h-[420px] w-full shrink-0 md:h-auto md:min-h-[360px] md:flex-1 md:shrink"
        >
          <PendingBar className="h-full w-full rounded-[10px]" />
        </div>
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
  );
}

/** The Radix layers that take Esc before this frame, and how they say they
 *  are open — `VizLightboxShell`'s own rule. */
const LAYERS =
  '[data-radix-popper-content-wrapper] > *, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
const OPEN_STATES = ["open", "delayed-open", "instant-open"];

/**
 * The frame before the shell's chunk has loaded (see above). The scrim does
 * not fade in — the shell takes its place in the same spot without a fade
 * of its own (`appear={false}`), so the hand-off is still.
 */
export function LightboxChunkPending({
  label,
  onClose,
}: {
  label: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus: taken on mount, kept inside while shown, given back as it leaves
  // to whatever had it — the clicked card.
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    boxRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Tab") {
        // Close is the one control: Tab and Shift+Tab both land on it.
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }
      if (event.key !== "Escape") return;
      const own = boxRef.current;
      const layerOpen = [
        ...document.querySelectorAll<HTMLElement>(LAYERS),
      ].some(
        (el) => el !== own && OPEN_STATES.includes(el.dataset.state ?? ""),
      );
      if (layerOpen) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div aria-hidden="true" className={LIGHTBOX_OVERLAY_CLASS} />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Loading ${label}`}
        tabIndex={-1}
        data-testid="lightbox-chunk-pending"
        className={LIGHTBOX_BOX_CLASS}
      >
        <TooltipProvider>
          <div className="flex items-start gap-2.5 px-6 pt-6 pb-5">
            <div aria-hidden="true" className="flex min-w-0 flex-col gap-1">
              <span className="flex h-[22px] items-center">
                <PendingBar className="h-3 w-36" />
              </span>
              <LightboxSubtitlePending />
            </div>
            <span className="flex-1" />
            {/* Close's tooltip opens when Tab lands on it; an Esc then is the
                tooltip's first, and it hands it on, as the shell's does. */}
            <ChromeTooltip
              label="Close"
              shortcut="Esc"
              align="end"
              onEscapeKeyDown={onClose}
            >
              <button
                ref={closeRef}
                type="button"
                aria-label="Close"
                onClick={onClose}
                className={LIGHTBOX_CLOSE_CLASS}
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            </ChromeTooltip>
          </div>
          <LightboxBodyPending label={label} />
          <div aria-hidden="true" className="h-6 shrink-0" />
        </TooltipProvider>
      </div>
    </>,
    document.body,
  );
}
