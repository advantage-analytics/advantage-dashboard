/**
 * Ask `/api/billing/portal` for a Stripe Customer Portal address — the one
 * call behind "Manage billing" and "Update card", wherever they are drawn.
 * Browser only. What to do with the address is the caller's: Settings › Plan
 * goes there; the upload wizard's dialog opens it in a new tab so the picked
 * video is not lost.
 */
export type BillingPortalAnswer =
  { ok: true; url: string } | { ok: false; message: string };

export async function requestBillingPortal(): Promise<BillingPortalAnswer> {
  try {
    const response = await fetch("/api/billing/portal", { method: "POST" });
    const body = (await response.json().catch(() => null)) as {
      url?: string;
      error?: string;
    } | null;
    if (response.ok && body?.url) return { ok: true, url: body.url };
    return {
      ok: false,
      message: body?.error ?? "Billing couldn't open. Try again in a moment.",
    };
  } catch {
    return {
      ok: false,
      message: "Billing couldn't open. Check your connection and try again.",
    };
  }
}

/** Said when the browser would not open a tab; the link beside it still works. */
export const PORTAL_TAB_BLOCKED = "Billing couldn't open in a new tab.";

/** The little of `window` a new tab is opened and pointed with. */
interface PortalTab {
  opener: unknown;
  closed: boolean;
  close: () => void;
  location: { replace: (url: string) => void };
}

export type BillingPortalTabAnswer =
  | { kind: "opened" }
  /** No tab could be opened: `url` is for a link the user clicks themselves. */
  | { kind: "blocked"; url: string }
  | { kind: "failed"; message: string };

/**
 * Open the billing portal in a NEW tab, for a page that must not navigate
 * away (the upload wizard holds an in-memory video). Call it inside the click:
 * the blank tab is opened before the request, because a tab opened after an
 * `await` is not the click's any more and the browser blocks it. That is also
 * why a blocked tab is not retried here: the caller is handed the address to
 * draw as a real link instead.
 *
 * The blank tab's `opener` is cleared before it is pointed anywhere, so the
 * portal gets no handle on this page, the same as a `rel="noopener"` link.
 */
export async function openBillingPortalTab(
  open: () => PortalTab | null = () => window.open("", "_blank"),
  request: () => Promise<BillingPortalAnswer> = requestBillingPortal,
): Promise<BillingPortalTabAnswer> {
  let tab: PortalTab | null = null;
  try {
    tab = open();
    if (tab) tab.opener = null;
  } catch {
    tab = null;
  }
  const answer = await request();
  if (!answer.ok) {
    tab?.close();
    return { kind: "failed", message: answer.message };
  }
  // Blocked, or closed by hand while the address was on its way.
  if (!tab || tab.closed) return { kind: "blocked", url: answer.url };
  tab.location.replace(answer.url);
  return { kind: "opened" };
}
