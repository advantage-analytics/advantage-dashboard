/** How long "Copied" / "Copy failed" stays beside the ⋯ button. */
export const COPY_FEEDBACK_MS = 1600;
export const COPIED = "Copied";
export const COPY_FAILED = "Copy failed";
export type CopyResult = typeof COPIED | typeof COPY_FAILED;

/**
 * Copies `value`, answering what happened. No clipboard (an insecure
 * context) is a refusal too. Never rejects.
 */
export async function copyText(
  clipboard: Pick<Clipboard, "writeText"> | undefined,
  value: string,
): Promise<CopyResult> {
  if (!clipboard) return COPY_FAILED;
  try {
    await clipboard.writeText(value);
    return COPIED;
  } catch {
    return COPY_FAILED;
  }
}

interface Timers {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Shows a copy's result through `show`, then clears it after
 * `COPY_FEEDBACK_MS`; a second copy restarts the clock. `dispose` cancels a
 * pending clear (on unmount).
 */
export function copyFeedback(
  show: (result: CopyResult | null) => void,
  timers: Timers = realTimers,
) {
  let pending: unknown = null;
  const cancel = () => {
    if (pending !== null) timers.clear(pending);
    pending = null;
  };
  return {
    say(result: CopyResult) {
      show(result);
      cancel();
      pending = timers.set(() => {
        pending = null;
        show(null);
      }, COPY_FEEDBACK_MS);
    },
    dispose: cancel,
  };
}
