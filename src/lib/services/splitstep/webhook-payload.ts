/**
 * SplitStep webhook payload interpretation.
 *
 * Pure — no I/O, no clock, no side effects. Isolated because it is the one part
 * of the webhook written against a payload shape NOBODY HAS SEEN YET. The
 * vendor's docs describe it; nothing has round-tripped against their real
 * output (handoff §9).
 *
 * So this module never assumes a path. It walks the payload looking for a field
 * whose NAME matches, comparing names with punctuation and case stripped, which
 * makes `sas_url`, `sasUrl` and `SasUrl` the same key. If the vendor nests the
 * interesting fields under `data` or `result`, or renames `job_id` to `jobId`,
 * extraction still works and the smoke test still produces something.
 *
 * Nothing here throws and nothing here rejects. An unrecognised payload yields
 * a result with null fields — the route still records the raw body verbatim,
 * which is the actual point of the exercise (handoff §3).
 */

/** Our `processing_jobs.status`, as advanced by a vendor delivery. */
export type WebhookNextStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ParsedWebhook {
  /** The vendor's job identifier, if one could be found. */
  externalJobId: string | null;
  /** Normalised event name, lowercased — e.g. `job_completed`. */
  event: string | null;
  /** Status to advance the job to, or null to leave it alone. */
  nextStatus: WebhookNextStatus | null;
  /** Short-lived URL to the results JSON. Present on completion. */
  sasUrl: string | null;
  /**
   * Short-lived URL to the trimmed, re-encoded video the vendor processed.
   * Present on completion, alongside — and distinct from — `sasUrl`.
   *
   * This is the match with dead time cut, and it is the only video that
   * survives a job: the webhook deletes our own source once results are stored.
   * It is a SAS, so it expires; the URL is worth recording, but the bytes are
   * what actually need securing.
   */
  trimmedVideoUrl: string | null;
  /**
   * Vendor error text. Free-form, with raw underlying errors in it — store and
   * log, never parse for control flow (handoff §7 Q7).
   */
  errorMessage: string | null;
  /** The `MatchID` we sent, echoed back. Fallback link to a job row. */
  matchId: string | null;
}

/** Lowercase and drop non-alphanumerics, so `sas_url` === `sasUrl`. */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

type Json = unknown;

/**
 * Depth-first search for the first non-empty value under any of `candidates`.
 *
 * Breadth would be more predictable, but depth-first with candidates ordered by
 * specificity gets the same answer on every shape observed in the docs and is
 * far less code. Arrays are walked too — a payload that wraps its event in a
 * single-element list is exactly the kind of thing that shows up in practice.
 */
function findFirst(
  value: Json,
  candidates: string[],
  depth = 0
): string | null {
  // Bounded so a self-referential payload cannot spin. Nothing legitimate is
  // this deep.
  if (depth > 8 || value == null) return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findFirst(entry, candidates, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  if (typeof value !== 'object') return null;

  const record = value as Record<string, Json>;

  // Own keys first, so a top-level `job_id` beats a nested one.
  for (const candidate of candidates) {
    for (const [key, entry] of Object.entries(record)) {
      if (normaliseKey(key) !== candidate) continue;

      if (typeof entry === 'string' && entry.trim() !== '') {
        return entry.trim();
      }
      if (typeof entry === 'number' && Number.isFinite(entry)) {
        return String(entry);
      }
    }
  }

  for (const entry of Object.values(record)) {
    const found = findFirst(entry, candidates, depth + 1);
    if (found !== null) return found;
  }

  return null;
}

/**
 * Map a vendor event or status string onto our job status.
 *
 * Returns null for anything unrecognised rather than guessing. A null leaves
 * the job status untouched, which is the safe direction: an unknown event
 * should never be the reason a job moves.
 */
export function mapToNextStatus(raw: string | null): WebhookNextStatus | null {
  if (!raw) return null;

  const value = normaliseKey(raw);

  // Order matters — `jobcompleted` contains `completed`, so exact-ish matches
  // are checked by inclusion against the most specific term.
  if (value.includes('fail') || value.includes('error')) return 'failed';
  if (value.includes('complete') || value.includes('success')) return 'completed';
  if (value.includes('process') || value.includes('running')) return 'processing';
  if (value.includes('queue') || value.includes('accept')) return 'queued';

  return null;
}

const JOB_ID_KEYS = ['externaljobid', 'jobid', 'job', 'id'];
const EVENT_KEYS = ['event', 'eventtype', 'type', 'status', 'state'];
const SAS_URL_KEYS = [
  'sasurl',
  'resultsurl',
  'resulturl',
  'resultsuri',
  'downloadurl',
  'outputurl',
  'url',
];
const ERROR_KEYS = ['errormessage', 'error', 'message', 'reason', 'detail'];
const MATCH_ID_KEYS = ['matchid'];

/**
 * The trimmed video, which arrives beside `sas_url` on a completion.
 *
 * The documented name leads; the other two are the same cheap hedge the
 * signature header list makes, for a payload whose real shape one delivery has
 * yet to confirm.
 *
 * Deliberately nothing as broad as `videourl`. `VideoUrl` is the field WE send
 * on the job request, so a vendor that echoes its input back would hand us the
 * original as if it were the trimmed output — and the two are indistinguishable
 * once stored. Narrow candidates fail closed; a broad one fails silently in the
 * one direction that matters.
 */
const TRIMMED_VIDEO_URL_KEYS = [
  'trimmedvideourl',
  'trimmedurl',
  'processedvideourl',
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Interpret a parsed JSON webhook body. Never throws. */
export function parseWebhookPayload(body: unknown): ParsedWebhook {
  const event = findFirst(body, EVENT_KEYS);
  const matchId = findFirst(body, MATCH_ID_KEYS);

  // A `status` field can carry the event, and an `event` field can carry the
  // status. Try the event first, then fall back to any explicit status.
  const nextStatus =
    mapToNextStatus(event) ?? mapToNextStatus(findFirst(body, ['status', 'state']));

  // Only surface an error string on a delivery that actually failed. `message`
  // is a common key for benign human-readable text, and storing "Job accepted"
  // in error_message would be worse than storing nothing.
  const errorMessage =
    nextStatus === 'failed' ? findFirst(body, ERROR_KEYS) : null;

  return {
    externalJobId: findFirst(body, JOB_ID_KEYS),
    event: event ? event.toLowerCase() : null,
    nextStatus,
    // `url` is last in the candidate list and broad enough to catch our own
    // echoed VideoUrl, so only accept something that looks fetchable.
    sasUrl: asHttpUrl(findFirst(body, SAS_URL_KEYS)),
    trimmedVideoUrl: asHttpUrl(findFirst(body, TRIMMED_VIDEO_URL_KEYS)),
    errorMessage,
    // Guarded: the fallback lookup passes this straight into a uuid column.
    matchId: matchId && UUID_RE.test(matchId) ? matchId : null,
  };
}

function asHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}
