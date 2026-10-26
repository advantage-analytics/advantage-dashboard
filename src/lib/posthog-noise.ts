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

/** True when a `$exception` event is noise we never want in error tracking. */
export function isUnfixableNoise(event: CaptureResult): boolean {
  if (event.event !== "$exception") return false;
  const list = event.properties?.$exception_list;
  if (!Array.isArray(list)) return false;
  return list.some(
    (entry: unknown) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { value?: unknown }).value === "string" &&
      NOISE.some((pattern) => pattern.test((entry as { value: string }).value)),
  );
}

/** posthog-js `before_send`: drop the noise, pass everything else through. */
export function dropUnfixableNoise(
  event: CaptureResult | null,
): CaptureResult | null {
  if (event && isUnfixableNoise(event)) return null;
  return event;
}
