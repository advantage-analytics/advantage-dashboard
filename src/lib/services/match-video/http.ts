/**
 * What every `/api/matches/[matchId]/video/*` handler does at the HTTP edge,
 * in one place: the same-origin check and bounded body read that the plan's
 * shared contracts require of every mutation, and the response constructors
 * that stamp `Cache-Control: private, no-store` on everything — a credential
 * must never sit in a shared cache, and neither should a 409 that reveals
 * which attachment is active.
 *
 * Four codes here are TRANSPORT failures with no counterpart in
 * `MatchVideoErrorCode`, and they are deliberately not added to it: that
 * union names outcomes of the attachment domain (a stale version, a short
 * recording), while these name a request that never reached the domain — the
 * wrong origin, a body that was not JSON, a body too big to be one of ours,
 * or a bug on this side. `MatchVideoError` is assignable to
 * `MatchVideoHttpError`, so a handler returns either through one function.
 *
 * Framework-light on purpose: `Request` and `NextResponse` only, so the
 * handlers are callable from a spec with a hand-built `Request`.
 */

import { NextResponse } from "next/server";

import type {
  MatchVideoError,
  MatchVideoErrorCode,
} from "@/lib/match-video/types";

/* -------------------------------------------------------------------------
 * Errors
 * ---------------------------------------------------------------------- */

export type TransportErrorCode =
  "invalid_request" | "cross_origin" | "request_too_large" | "internal_error";

export interface MatchVideoHttpError {
  code: MatchVideoErrorCode | TransportErrorCode;
  status: number;
  message: string;
  /** Machine slug naming the specific cause. Never rendered. */
  detail: string;
}

const TRANSPORT_SPECS: Record<
  TransportErrorCode,
  { status: number; message: string }
> = {
  invalid_request: { status: 400, message: "This request is not valid." },
  cross_origin: {
    status: 403,
    message: "This request must come from the app.",
  },
  request_too_large: {
    status: 413,
    message: "This request is too large.",
  },
  internal_error: {
    status: 500,
    message: "Something went wrong on our side. Try again in a moment.",
  },
};

export function transportError(
  code: TransportErrorCode,
  detail: string,
): MatchVideoHttpError {
  const spec = TRANSPORT_SPECS[code];
  return { code, status: spec.status, message: spec.message, detail };
}

export type HttpResult<T> =
  { ok: true; value: T } | { ok: false; error: MatchVideoHttpError };

/* -------------------------------------------------------------------------
 * Same-origin
 * ---------------------------------------------------------------------- */

/**
 * A mutation must come from a page this deployment served.
 *
 * Two signals, both from the browser and neither settable by page script:
 * `Sec-Fetch-Site`, when present, must not say cross-site (or same-site — a
 * sibling subdomain is not this app); and `Origin` must be one of
 * `allowedOrigins`. A request with no `Origin` at all is refused: browsers
 * always send it on a `fetch` POST, so its absence means a non-browser
 * client, and the only credential a non-browser client could be carrying is
 * a cookie it took from a browser.
 *
 * The request's own origin is always allowed, so a preview deployment works
 * without configuration; the caller adds the configured site URL for the
 * case where a proxy rewrote the host.
 */
export function checkSameOrigin(
  request: Request,
  allowedOrigins: readonly string[] = [],
): MatchVideoHttpError | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return transportError("cross_origin", `sec_fetch_site_${site}`);
  }
  const origin = request.headers.get("origin");
  if (!origin) return transportError("cross_origin", "no_origin");

  const allowed = new Set<string>();
  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    // An unparseable request URL allows nothing extra.
  }
  for (const candidate of allowedOrigins) {
    try {
      allowed.add(new URL(candidate).origin);
    } catch {
      // A misconfigured site URL must not widen the set to "anything".
    }
  }
  return allowed.has(origin)
    ? null
    : transportError("cross_origin", "origin_not_allowed");
}

/* -------------------------------------------------------------------------
 * Bounded body
 * ---------------------------------------------------------------------- */

/**
 * The most bytes any attachment mutation body may carry. The largest legal
 * one is a filename of 255 characters plus a handful of short fields; four
 * KiB leaves room for every UTF-8 filename that fits and nothing else.
 */
export const MUTATION_BODY_MAX_BYTES = 4096;

/**
 * Read and parse a JSON body without ever holding more than `maxBytes`.
 *
 * The declared `Content-Length` is checked first, but a chunked body has none,
 * so the stream is read chunk by chunk and abandoned the moment the running
 * total crosses the cap — `request.json()` would buffer the whole thing
 * before this code got a say. `Content-Type` must be JSON: that makes the
 * request one the browser preflights, which is the other half of the
 * same-origin story above.
 */
export async function readBoundedJson(
  request: Request,
  maxBytes: number = MUTATION_BODY_MAX_BYTES,
): Promise<HttpResult<unknown>> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) {
    return {
      ok: false,
      error: transportError("request_too_large", "content_length"),
    };
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;.*)?$/i.test(contentType.trim())) {
    return {
      ok: false,
      error: transportError("invalid_request", "content_type"),
    };
  }
  if (!request.body) {
    return { ok: false, error: transportError("invalid_request", "no_body") };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return {
          ok: false,
          error: transportError("request_too_large", "body_stream"),
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      error: transportError("invalid_request", "body_unreadable"),
    };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return {
      ok: false,
      error: transportError("invalid_request", "malformed_json"),
    };
  }
}

/* -------------------------------------------------------------------------
 * Responses
 * ---------------------------------------------------------------------- */

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** A JSON success, never cacheable. */
export function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * A JSON refusal. `error` carries the sentence — the field every existing
 * client of this app's routes already reads — and `code` the stable slug a
 * new client branches on. `detail` is for logs and tests.
 */
export function errorResponse(
  error: MatchVideoHttpError | MatchVideoError,
): NextResponse {
  return NextResponse.json(
    { error: error.message, code: error.code, detail: error.detail },
    { status: error.status, headers: NO_STORE },
  );
}
