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
  ExpectedActiveAttachment,
  MatchVideoError,
  MatchVideoErrorCode,
} from "@/lib/match-video/types";

import { isUuid } from "./access";

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

/**
 * The check for a mutation that carries NO metadata — renewal and
 * cancellation (T9), whose only argument is the attachment id in the path.
 *
 * Two things are asserted, and they are two different concerns:
 *
 *   the JSON content type, even though there is nothing to parse, because
 *   that is what makes the request one a browser preflights — the other half
 *   of {@link checkSameOrigin}'s story, and a header a cross-origin form or
 *   `<img>` cannot set;
 *
 *   an absent or EMPTY body, because these endpoints have no field a client
 *   may set. A body with keys in it is refused by name rather than ignored,
 *   for the reason `parseReserveUploadBody` gives: a client that starts
 *   sending `expectedActive` should learn on the first request that it has no
 *   effect, not assume it had one.
 *
 * Built on {@link readBoundedJson}, so a body that IS sent is still capped
 * and never fully buffered.
 */
export async function readNoMetadataBody(
  request: Request,
  maxBytes: number = MUTATION_BODY_MAX_BYTES,
): Promise<MatchVideoHttpError | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;.*)?$/i.test(contentType.trim())) {
    return transportError("invalid_request", "content_type");
  }
  if (!request.body) return null;

  const parsed = await readBoundedJson(request, maxBytes);
  if (!parsed.ok) return parsed.error;

  const value = parsed.value;
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length > 0
  ) {
    return transportError("invalid_request", "unexpected_body");
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Shared body parsing
 * ---------------------------------------------------------------------- */

/**
 * A JSON object literal — not an array, not a class instance, not `null`.
 * Every mutation body is one, and the prototype check is what keeps a
 * `{"__proto__": …}` payload from arriving as something with inherited keys.
 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** The 400 every body-shape refusal returns, with its cause slug. */
export function invalidRequest(detail: string): HttpResult<never> {
  return { ok: false, error: transportError("invalid_request", detail) };
}

/**
 * The caller's belief about which attachment is currently active.
 *
 * Shared by reservation (T8) and completion (T10) — one copy, because the
 * two must agree exactly on what counts as a well-formed belief. Three rules
 * carry the design:
 *
 *   an explicit `null` is a claim ("this match has no video"), and callers
 *   check for the KEY's presence separately, so a client that simply forgot
 *   the field cannot pass as one asserting an empty match;
 *
 *   unknown keys are refused by name rather than dropped, so a client that
 *   starts sending a field learns on its first request that it has none;
 *
 *   the id is lower-cased, because a UUID that differs only in case is the
 *   same row and must not lose an optimistic-concurrency comparison.
 */
export function parseExpectedActive(
  value: unknown,
): HttpResult<ExpectedActiveAttachment | null> {
  if (value === null) return { ok: true, value: null };
  if (!isPlainObject(value)) return invalidRequest("expected_active_type");
  for (const key of Object.keys(value)) {
    if (key !== "id" && key !== "version") {
      return invalidRequest(`expected_active_field:${key}`);
    }
  }
  if (!isUuid(value.id)) return invalidRequest("expected_active_id");
  if (
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 0
  ) {
    return invalidRequest("expected_active_version");
  }
  return {
    ok: true,
    value: { id: value.id.toLowerCase(), version: value.version },
  };
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
