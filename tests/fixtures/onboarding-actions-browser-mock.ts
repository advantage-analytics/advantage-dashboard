/**
 * `markTourDone` for browser harnesses: records every call on
 * `window.__markTourDoneCalls` and answers success, unless the page set
 * `window.__markTourDoneRejects`, in which case the promise rejects — the
 * transport failure the runner must close the tour through regardless.
 */
declare global {
  interface Window {
    __markTourDoneCalls?: string[];
    __markTourDoneRejects?: boolean;
  }
}

export async function markTourDone(
  tour: string,
): Promise<{ error: string | null; code?: string }> {
  window.__markTourDoneCalls = [...(window.__markTourDoneCalls ?? []), tour];
  if (window.__markTourDoneRejects) {
    throw new Error("Failed to fetch");
  }
  return { error: null };
}
