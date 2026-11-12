/**
 * Which of the console's own fixes a browser remembers trying
 * (label-console.tsx `useOncePerKey`), under one storage name per session and
 * kind of fix. Pure over the storage it is handed, so a spec can drive it.
 */

/** How many keys a session keeps in the browser, per list. */
export const AUTO_FIX_KEYS_KEPT = 200;

type KeyStore = Pick<Storage, "getItem" | "setItem">;

/** The keys kept under `name`; throws where storage does. */
export function readTriedKeys(store: KeyStore, name: string): string[] {
  const parsed: unknown = JSON.parse(store.getItem(name) ?? "[]");
  return Array.isArray(parsed)
    ? parsed.filter((k): k is string => typeof k === "string")
    : [];
}

function keep(store: KeyStore, name: string, kept: string[], key: string) {
  if (kept.includes(key)) return;
  store.setItem(
    name,
    JSON.stringify([...kept, key].slice(-AUTO_FIX_KEYS_KEPT)),
  );
}

/**
 * Record how the fix under `key` went. One that settled is kept, so a reload
 * does not try it again. One that failed is given one more visit: a dropped
 * connection is tried again next time, and a fix that fails twice is kept as
 * tried, so it stops asking.
 */
export function keepAutoFixKey(
  store: KeyStore,
  name: string,
  key: string,
  settled: boolean,
): void {
  const failedName = `${name}:failed`;
  const failed = readTriedKeys(store, failedName);
  if (!settled && !failed.includes(key)) {
    keep(store, failedName, failed, key);
    return;
  }
  keep(store, name, readTriedKeys(store, name), key);
}
