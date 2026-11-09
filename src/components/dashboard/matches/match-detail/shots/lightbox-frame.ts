/**
 * The lightbox's frame, as classes (Dialog v3, `reference/chrome.md`): the
 * scrim, the box, the enter fade and the close button `VizLightboxShell`
 * draws. Shared with the frame drawn while the shell's chunk is still
 * loading (`loading/lightbox-pending.tsx`'s `LightboxChunkPending`), so the
 * two cannot drift apart — the one is replaced by the other in place.
 *
 * Pure strings, no React: Tailwind reads them from here.
 */

export const LIGHTBOX_OVERLAY_CLASS =
  "fixed inset-0 z-50 bg-[rgba(13,13,13,0.4)]";

/** The enter fade, on the scrim and the box alike. The shell leaves it off
 *  when it replaces a frame already on screen (`appear`). */
export const LIGHTBOX_ENTER_CLASS =
  "data-[state=open]:animate-in data-[state=open]:fade-in-0";

export const LIGHTBOX_BOX_CLASS =
  "fixed top-[clamp(16px,10dvh,96px)] left-1/2 z-50 flex h-[min(880px,calc(100dvh-clamp(16px,10dvh,96px)-32px))] w-[min(1212px,calc(100vw-32px))] -translate-x-1/2 flex-col rounded-[14px] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)] outline-none";

export const LIGHTBOX_CLOSE_CLASS =
  "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area";
