/**
 * Video access Worker — the vendor-facing door in front of R2.
 *
 * Implements spec §3.2 option (b). The vendor receives
 * `https://{worker}/v/{token}` and never sees an R2 URL, a bucket name, or an
 * object key.
 *
 * Every request does exactly one thing before touching storage: trades the
 * token for an object key via `resolve_video_access_token()`, which also
 * records the fetch. The log write lives inside that function rather than here
 * so it cannot be skipped — and that log is our only "processing started"
 * signal, since the vendor fetches lazily and declined to send such a webhook.
 *
 * Deploy: see README.md. This directory is outside the Next.js app and is not
 * built or deployed by Vercel.
 */

export interface Env {
  /** R2 bucket holding source videos (R2_BUCKET_VIDEOS). */
  VIDEOS: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

/**
 * Must stay in step with VIDEO_ACCESS_PATH_PREFIX in
 * src/lib/services/splitstep/video-url/worker-token.ts. A Worker cannot import
 * from the app, so this is duplicated deliberately.
 */
const PATH_PREFIX = '/v/';

interface ResolvedToken {
  job_id: string;
  object_key: string;
}

/** Content types by extension, for objects stored without HTTP metadata. */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

/**
 * Single response for unknown, revoked, expired, and not-yet-uploaded tokens.
 *
 * Deliberately undifferentiated: distinguishing them would tell an unauthorised
 * caller whether a token was ever real.
 */
function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function resolveToken(
  token: string,
  env: Env
): Promise<ResolvedToken | null> {
  let response: Response;

  try {
    response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/resolve_video_access_token`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ p_token: token }),
      }
    );
  } catch (cause) {
    console.error('video-access: token resolution request failed', cause);
    return null;
  }

  if (!response.ok) {
    // Never log the token itself — it is a live bearer credential.
    console.error(
      `video-access: token resolution returned ${response.status}`,
      await response.text()
    );
    return null;
  }

  const rows = (await response.json()) as ResolvedToken[] | null;
  return rows?.[0] ?? null;
}

/**
 * Normalize R2's three range shapes into an absolute offset and length.
 *
 * Test the VALUES, not the keys. R2 hands back an object carrying all three
 * keys every time, with the unused ones set to `undefined` — confirmed against
 * the live bucket: a `bytes=-500` request logged
 * `keys=["offset","length","suffix"] val={"offset":1927914018,"length":500}`.
 *
 * So `'suffix' in range` was true even for offset ranges, sending
 * `Math.min(undefined, size)` to NaN and emitting
 * `content-range: bytes NaN-NaN/…`. The body was always correct, so it showed
 * up only in the header — a downloader strict about RFC 7233 would reject the
 * 206 while a lenient one streamed happily. Caught by the first real range
 * request ever made through this Worker.
 *
 * Note R2 pre-resolves a suffix range into offset+length, so the suffix branch
 * below is a fallback for a shape it has not actually been observed to return.
 */
function resolveRange(
  range: R2Range,
  size: number
): { offset: number; length: number } {
  if ('suffix' in range && range.suffix !== undefined) {
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }

  const offset = ('offset' in range && range.offset !== undefined)
    ? range.offset
    : 0;
  const length = ('length' in range && range.length !== undefined)
    ? range.length
    : size - offset;

  return { offset, length };
}

function baseHeaders(object: R2Object, key: string): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  // Multi-GB fetches are resumed in practice; advertise support explicitly.
  headers.set('accept-ranges', 'bytes');

  // The URL is a bearer credential. Keep it out of shared caches.
  headers.set('cache-control', 'private, no-store');

  if (!headers.has('content-type')) {
    const extension = key.split('.').pop()?.toLowerCase() ?? '';
    headers.set(
      'content-type',
      CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream'
    );
  }

  return headers;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { allow: 'GET, HEAD' },
      });
    }

    const { pathname } = new URL(request.url);
    if (!pathname.startsWith(PATH_PREFIX)) {
      return notFound();
    }

    // Tokens are base64url — no slashes, so anything nested is not a token.
    const token = pathname.slice(PATH_PREFIX.length);
    if (!token || token.includes('/')) {
      return notFound();
    }

    const resolved = await resolveToken(token, env);
    if (!resolved) {
      return notFound();
    }

    const { job_id: jobId, object_key: key } = resolved;

    if (request.method === 'HEAD') {
      const head = await env.VIDEOS.head(key);
      if (!head) {
        console.error(`video-access: job ${jobId} has no object at ${key}`);
        return notFound();
      }

      const headers = baseHeaders(head, key);
      headers.set('content-length', String(head.size));
      return new Response(null, { status: 200, headers });
    }

    const rangeHeader = request.headers.get('range');
    const object = await env.VIDEOS.get(
      key,
      rangeHeader ? { range: request.headers } : undefined
    );

    if (!object) {
      console.error(`video-access: job ${jobId} has no object at ${key}`);
      return notFound();
    }

    const headers = baseHeaders(object, key);

    if (rangeHeader && object.range) {
      const { offset, length } = resolveRange(object.range, object.size);
      headers.set(
        'content-range',
        `bytes ${offset}-${offset + length - 1}/${object.size}`
      );
      headers.set('content-length', String(length));
      console.log(
        `video-access: job ${jobId} range ${offset}-${offset + length - 1}`
      );
      return new Response(object.body, { status: 206, headers });
    }

    headers.set('content-length', String(object.size));
    console.log(`video-access: job ${jobId} full fetch (${object.size} bytes)`);
    return new Response(object.body, { status: 200, headers });
  },
} satisfies ExportedHandler<Env>;
