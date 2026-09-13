/**
 * The address /check-email is talking about.
 *
 * B4 names the address the recovery link went to and counts down its expiry,
 * neither of which the shipped page could do — it received nothing from the
 * form. sessionStorage rather than a query param on purpose: an email address
 * in a URL ends up in server logs, browser history and any Referer header the
 * page happens to emit, and this one buys nothing by being shareable.
 *
 * Every read is defensive. A recovery mail can be opened on a different device
 * from the one that requested it, so /check-email has to render sensibly with
 * nothing in storage at all.
 */

const KEY = "advantage:recovery";

/**
 * Where a recovery link lands.
 *
 * `(auth)` is a route group, so it contributes no path segment — the page is at
 * /update-password, not /auth/update-password. Settings had the latter and its
 * "reset password" mail therefore delivered users to a 404; stating the path
 * once is what stops the three senders drifting apart again.
 */
export const RECOVERY_REDIRECT_PATH = "/update-password";

/** Absolute redirect target for Supabase's `redirectTo`, which requires one. */
export function recoveryRedirectTo(origin: string): string {
  return `${origin}${RECOVERY_REDIRECT_PATH}`;
}

/** Supabase's own floor for repeat reset requests. The UI counts to the same number. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** How long a Supabase recovery link stays valid. Mirrors the project's auth settings. */
export const LINK_TTL_SECONDS = 60 * 60;

export interface RecoveryHandoff {
  email: string;
  /** Epoch ms of the most recent send — drives both countdowns. */
  sentAt: number;
}

/**
 * Persist the address and send time, returning what was written.
 *
 * The return value matters: the resend path needs the new `sentAt` to restart
 * its countdown, and reading it back out of storage would both re-parse what we
 * just serialised and — when the write throws — hand back null, blanking the
 * address mid-flow.
 */
export function writeRecoveryHandoff(email: string): RecoveryHandoff {
  const payload: RecoveryHandoff = { email, sentAt: Date.now() };
  if (typeof window === "undefined") return payload;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Private-mode Safari throws on write. A fresh load then degrades to the
    // address-less copy, but this session keeps the address it already has.
  }
  return payload;
}

export function readRecoveryHandoff(): RecoveryHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as RecoveryHandoff).email !== "string" ||
      typeof (parsed as RecoveryHandoff).sentAt !== "number"
    ) {
      return null;
    }
    const { email, sentAt } = parsed as RecoveryHandoff;
    // A stale tab restored days later would otherwise count down from a
    // negative number and claim a long-dead link is still good.
    if (!email || Date.now() - sentAt > LINK_TTL_SECONDS * 1000) return null;
    return { email, sentAt };
  } catch {
    return null;
  }
}

/** Format a second count as m:ss (or mm:ss past ten minutes) for the countdowns. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
