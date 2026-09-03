import { useCallback, useSyncExternalStore } from "react";

/**
 * Advantage Intelligence insight dismissal, lifted out of the retired
 * `InsightStrip` so the rail's `RailInsightCard` inherits the same state
 * rather than starting fresh. The storage key and the `"true"` sentinel are
 * reproduced exactly — a player who dismissed the old Statistics-tab strip
 * (which itself inherited `AiInsightCard`'s key) never sees the rail card
 * reappear, and a dismissal made here would equally hide any of the earlier
 * surfaces if one were mounted again.
 */

/**
 * The dismissal key, unchanged since `AiInsightCard`. Exported so the pairing
 * stays greppable from wherever the insight is rendered.
 */
export function insightDismissedStorageKey(matchId: string): string {
  return `advantage-ai-insight-dismissed:${matchId}`;
}

/* localStorage is an external store, so the reader subscribes to it rather than
   mirroring it into state from an effect: the flag can also change in another
   tab, and a render-time read keeps the dismissed card from flashing in and
   back out. `getServerSnapshot` says "dismissed" so the server markup and the
   hydration render agree; React re-reads the real value straight after. */

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function notifyDismissalChanged(): void {
  for (const listener of listeners) listener();
}

/**
 * `{ dismissed, dismiss }` for one match. `dismiss()` writes the sentinel and
 * notifies every reader in this tab (the browser's own `storage` event only
 * fires in *other* tabs), so a card dismissed here disappears immediately.
 */
export function useInsightDismissal(matchId: string): {
  dismissed: boolean;
  dismiss: () => void;
} {
  const storageKey = insightDismissedStorageKey(matchId);

  const dismissed = useSyncExternalStore(
    subscribe,
    useCallback(() => localStorage.getItem(storageKey) === "true", [storageKey]),
    () => true,
  );

  const dismiss = useCallback(() => {
    localStorage.setItem(storageKey, "true");
    notifyDismissalChanged();
  }, [storageKey]);

  return { dismissed, dismiss };
}
