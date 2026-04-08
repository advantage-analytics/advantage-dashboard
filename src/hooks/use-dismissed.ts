import { useState, useCallback } from "react";

/**
 * Tracks whether a one-time UI hint has been dismissed.
 * Persists to localStorage so hints only appear once per device.
 */
export function useDismissed(key: string): [boolean, () => void] {
  const storageKey = `hint-dismissed:${key}`;

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(storageKey) === "1";
  });

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // Storage full or unavailable — still dismiss in-memory
    }
  }, [storageKey]);

  return [dismissed, dismiss];
}
