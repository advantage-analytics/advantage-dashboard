/**
 * The pure half of the leave-mid-upload guard (`leave-guard-context.tsx`).
 *
 * Kept free of React and Next so a spec can import it directly: whether a
 * chrome click should stop and ask, and what the dialog's confirm button says.
 */

/** The parts of a click that decide whether it opens a new tab. */
export interface LeaveClick {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * True when a click on a chrome link would take the viewer off a screen that
 * is still uploading, so the dialog should ask first.
 *
 * - Not armed: nothing is running here, so nothing to lose.
 * - Same pathname: the navigation does not leave the screen (a query-string
 *   change included), so the upload screen stays mounted.
 * - A modified or non-primary click opens a new tab and leaves this one where
 *   it is, which is exactly what keeps the upload going.
 */
export function shouldAskBeforeLeaving({
  armed,
  currentPath,
  href,
  event,
}: {
  armed: boolean;
  currentPath: string;
  href: string;
  event: LeaveClick;
}): boolean {
  if (!armed) return false;
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return false;
  return pathnameOf(href) !== currentPath;
}

/** The confirm button: "Go to <label>", or a plain "Leave this page". */
export function leaveConfirmLabel(label?: string | null): string {
  const name = label?.trim();
  return name ? `Go to ${name}` : "Leave this page";
}

function pathnameOf(href: string): string {
  try {
    // The base only resolves a relative href; its origin is never compared.
    return new URL(href, "http://localhost").pathname;
  } catch {
    return href.split(/[?#]/)[0];
  }
}
