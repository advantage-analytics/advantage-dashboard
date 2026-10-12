/**
 * Keeping the uploading tab alive, and saying so in its title.
 *
 * A match video uploads from the browser tab for an hour or more, and the two
 * ordinary ways it dies are the tab closing and the computer going to sleep.
 * `beforeunload` guards the first. This guards the second — a screen wake lock
 * held for as long as the trim and the transfer run — and puts the percentage
 * in the tab title, so a tab left in the background still reads as busy.
 *
 * Both are courtesies. Nothing here may fail, delay or cancel an upload: the
 * wake lock is feature-detected and every rejection is swallowed (Safari
 * refuses it in a hidden tab, Firefox behind a preference, any browser on low
 * battery), and the title is only ever restored to what the page itself last
 * set.
 *
 * The lock is released by the browser whenever the tab is hidden, so it is
 * re-requested each time the tab becomes visible again.
 */

/** The slice of `document` this needs — injectable so a spec needs no DOM. */
export interface TabAwakeDocument {
  title: string;
  visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
}

/** The slice of `navigator` this needs. `wakeLock` is absent where unsupported. */
export interface TabAwakeNavigator {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
}

export interface TabAwakeEnv {
  document?: TabAwakeDocument;
  navigator?: TabAwakeNavigator;
}

export interface TabAwakeHold {
  /** The transfer's percentage, floored into the tab title. */
  setPercent(percent: number): void;
  /** Let the screen sleep again and give the title back. Safe to call twice. */
  release(): void;
}

function browserEnv(): TabAwakeEnv {
  return {
    document: typeof document === "undefined" ? undefined : document,
    navigator:
      typeof navigator === "undefined"
        ? undefined
        : (navigator as TabAwakeNavigator),
  };
}

export function holdTabAwake(
  label = "Uploading video",
  env: TabAwakeEnv = browserEnv(),
): TabAwakeHold {
  const doc = env.document;
  const wakeLock = env.navigator?.wakeLock;

  let released = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let requesting = false;

  const acquire = () => {
    if (released || requesting || !wakeLock) return;
    if (sentinel && !sentinel.released) return;
    if (doc && doc.visibilityState !== "visible") return;
    requesting = true;
    let request: Promise<WakeLockSentinelLike>;
    try {
      request = wakeLock.request("screen");
    } catch {
      requesting = false;
      return;
    }
    request
      .then((held) => {
        requesting = false;
        if (released) {
          void held.release().catch(() => {});
          return;
        }
        sentinel = held;
      })
      .catch(() => {
        requesting = false;
      });
  };

  const onVisibility = () => {
    if (doc?.visibilityState === "visible") acquire();
  };

  acquire();
  doc?.addEventListener("visibilitychange", onVisibility);

  // Our own prefix, wherever it came from. A second hold in the same tab (two
  // uploads at once) sees the first one's title; without this each would take
  // the other's for the page's own and prefix it again on every write.
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ownPrefix = new RegExp(`^(?:\\d{1,3}% · ${escapedLabel}(?: · |$))+`);
  const pageTitleOf = (title: string) => title.replace(ownPrefix, "");

  // The title the page itself last set. In-app navigation rewrites
  // `document.title` under a running upload, so it is re-read on every write
  // rather than captured once.
  let pageTitle = pageTitleOf(doc?.title ?? "");
  let ownTitle: string | null = null;
  let lastPercent: number | null = null;

  return {
    setPercent(percent) {
      if (released || !doc || !Number.isFinite(percent)) return;
      const floored = Math.max(0, Math.min(100, Math.floor(percent)));
      const navigated = ownTitle !== null && doc.title !== ownTitle;
      if (floored === lastPercent && !navigated) return;
      if (ownTitle === null || navigated) pageTitle = pageTitleOf(doc.title);
      lastPercent = floored;
      ownTitle = pageTitle
        ? `${floored}% · ${label} · ${pageTitle}`
        : `${floored}% · ${label}`;
      doc.title = ownTitle;
    },
    release() {
      if (released) return;
      released = true;
      doc?.removeEventListener("visibilitychange", onVisibility);
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => {});
      }
      sentinel = null;
      // Only when the title is still ours: a route that has since set its own
      // keeps it.
      if (doc && ownTitle !== null && doc.title === ownTitle) {
        doc.title = pageTitle;
      }
      ownTitle = null;
    },
  };
}
