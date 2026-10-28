/**
 * A Labels list row's key in `admin_seen` (surface `labels`). Shared by the
 * page, the nav count (`countLabelsForNav`) and the row's click, so the dot
 * a click clears is the one the server counted.
 */
export const labelJobSeenKey = (jobId: string) => `job:${jobId}`;
