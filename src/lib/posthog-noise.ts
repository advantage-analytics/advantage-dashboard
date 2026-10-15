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
      SCANNER_REJECTION.test((entry as { value: string }).value),
  );
}

/** posthog-js `before_send`: drop the noise, pass everything else through. */
export function dropUnfixableNoise(
  event: CaptureResult | null,
): CaptureResult | null {
  if (event && isUnfixableNoise(event)) return null;
  return event;
}
