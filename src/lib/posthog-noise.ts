import type { CaptureResult } from "posthog-js";

/**
 * Exceptions no code of ours can cause or fix, dropped before posthog-js
 * sends them.
 *
 * "Object Not Found Matching Id:<n>, MethodName:<m>, ParamCount:<p>" is the
 * rejection a Microsoft link scanner (Outlook Safe Links / Defender for Office
 * 365) leaves behind when it opens a mailed link in its sandboxed browser and
 * its automation bridge loses track of an object. Our outreach and claim
 * emails link to /claim/*, so every scanned email shows up as a burst of
 * these on a claim page from an Azure IP, with no real person behind it.
 * The text is the scanner's, not ours: nothing in this repo throws it.
 */
const SCANNER_REJECTION = /Object Not Found Matching Id:\d+, MethodName:\w+/;

/**
 * "ResizeObserver loop completed with undelivered notifications." (Safari,
 * Firefox, current Chrome) and "ResizeObserver loop limit exceeded" (older
 * Chrome) are browser notices, not failures. The spec fires them as a window
 * `error` event with no Error object when a ResizeObserver callback changes
 * layout and the browser defers the resulting notifications to the next
 * frame; those notifications are still delivered and nothing breaks. They
 * arrive with no stack, so they can't be traced to a component either.
 * Anchored to the whole message so a real error that merely mentions
 * ResizeObserver still reaches error tracking.
 */
const RESIZE_OBSERVER_LOOP =
  /^ResizeObserver loop (?:completed with undelivered notifications\.|limit exceeded)$/;

const NOISE = [SCANNER_REJECTION, RESIZE_OBSERVER_LOOP];

/**
 * A desktop browser whose page fills the whole screen, to the pixel: no tab
 * strip, no address bar, no taskbar. People rarely browse like that; the
 * sandboxed Chrome a link scanner opens a mailed link in did every time.
 * Over 30 days of pageviews to 2026-11-21, desktop sessions with the
 * viewport equal to the screen numbered 743 (586 Windows, 157 macOS) with
 * one signed-in user among them, and came from datacenter towns (Boydton VA
 * and Des Moines IA for Microsoft Azure, Council Bluffs IA for Google).
 * A person in a true full-screen window (F11) matches too, which is why only
 * a failed chunk is dropped on this signature. Phones and tablets are left
 * out, since a page there can fill the screen for a real person.
 */
function isFullScreenDesktop(properties: CaptureResult["properties"]): boolean {
  if (properties?.$device_type !== "Desktop") return false;
  const { $viewport_width, $viewport_height, $screen_width, $screen_height } =
    properties;
  return (
    typeof $screen_width === "number" &&
    typeof $screen_height === "number" &&
    $screen_width > 0 &&
    $screen_height > 0 &&
    $viewport_width === $screen_width &&
    $viewport_height === $screen_height
  );
}

function exceptionEntries(
  event: CaptureResult,
): { type?: unknown; value?: unknown }[] {
  const list = event.properties?.$exception_list;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (entry: unknown): entry is { type?: unknown; value?: unknown } =>
      typeof entry === "object" && entry !== null,
  );
}

/** True when a `$exception` event is noise we never want in error tracking. */
export function isUnfixableNoise(event: CaptureResult): boolean {
  if (event.event !== "$exception") return false;
  const entries = exceptionEntries(event);
  if (
    entries.some(
      ({ value }) =>
        typeof value === "string" &&
        NOISE.some((pattern) => pattern.test(value)),
    )
  )
    return true;
  // A lazy chunk that would not load, in a link scanner's sandbox (PostHog
  // issue 01a1cc8b): every occurrence was an anonymous visit to a shared
  // /m/<token> report from a Microsoft Azure IP (Boydton VA, WA), all three
  // in a 1920x1080 window that filled its 1920x1080 screen. A person's
  // failed chunk, in a normal window, still reaches error tracking.
  return (
    isFullScreenDesktop(event.properties) &&
    entries.some(({ type }) => type === "ChunkLoadError")
  );
}

/** posthog-js `before_send`: drop the noise, pass everything else through. */
export function dropUnfixableNoise(
  event: CaptureResult | null,
): CaptureResult | null {
  if (event && isUnfixableNoise(event)) return null;
  return event;
}
