export const RETRY_STORAGE_PREFIX = "match-detail-retry:";

export function clearRetryCount(matchId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(`${RETRY_STORAGE_PREFIX}${matchId}`);
}

export function readRetryCount(matchId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.sessionStorage.getItem(`${RETRY_STORAGE_PREFIX}${matchId}`);
  return Number(raw) || 0;
}

export function writeRetryCount(matchId: string, count: number) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    `${RETRY_STORAGE_PREFIX}${matchId}`,
    String(count),
  );
}
