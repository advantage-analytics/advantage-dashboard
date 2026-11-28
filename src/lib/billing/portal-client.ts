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
