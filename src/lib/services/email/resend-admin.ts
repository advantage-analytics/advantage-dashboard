import {
  RESEND_ENDPOINT,
  RESEND_SUPPRESSION_ENDPOINT,
  SEND_TIMEOUT_MS,
} from "./config";

/**
 * The Resend calls outreach needs besides sending: the whole suppression list,
 * cancelling a scheduled message, and reading a sent message's Message-ID.
 *
 * SERVER ONLY, for the same reason as `send.ts`. Every function here returns
 * its failure instead of throwing, because each caller is a server action an
 * admin is waiting on and has better words for the failure than a stack trace.
 */

type Fail = { ok: false; error: string };

function apiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

async function resendFetch(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: true; status: number; body: unknown } | Fail> {
  const key = apiKey();
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const raw = await response.text();
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "message" in body
          ? String((body as { message: unknown }).message)
          : `Resend answered ${response.status}.`;
      return { ok: false, error: message };
    }
    return { ok: true, status: response.status, body };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "Resend timed out." : "We couldn't reach Resend.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Every address on the account's suppression list, lower-cased: unsubscribes,
 * hard bounces and spam complaints.
 *
 * One paginated read per tranche instead of `send.ts`'s lookup per message —
 * at forty programs with their staff that is a hundred lookups saved, and the
 * CC addresses, which the per-message check never looked at, get filtered too.
 */
export async function listSuppressedAddresses(): Promise<
  { ok: true; addresses: Set<string> } | Fail
> {
  const addresses = new Set<string>();
  let after: string | null = null;
  // A hard ceiling so a misbehaving cursor cannot loop forever.
  for (let page = 0; page < 200; page++) {
    const url = `${RESEND_SUPPRESSION_ENDPOINT}?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const result = await resendFetch(url);
    if (!result.ok) return result;
    const body = result.body as {
      data?: { id?: string; email?: string }[];
      has_more?: boolean;
    };
    const rows = body?.data ?? [];
    for (const row of rows) {
      if (row.email) addresses.add(row.email.toLowerCase());
    }
    if (!body?.has_more || rows.length === 0) break;
    after = rows[rows.length - 1]?.id ?? null;
    if (!after) break;
  }
  return { ok: true, addresses };
}

/** Cancel a message that was sent with `scheduledAt` and has not gone yet. */
export async function cancelScheduledEmail(
  resendId: string,
): Promise<{ ok: true } | Fail> {
  const result = await resendFetch(
    `${RESEND_ENDPOINT}/${encodeURIComponent(resendId)}/cancel`,
    { method: "POST" },
  );
  return result.ok ? { ok: true } : result;
}

/**
 * The Message-ID header of a message we sent, so a follow-up can set
 * `In-Reply-To` and land in the same thread. `null` when Resend does not
 * report one; the follow-up still sends, as a new thread with a "Re:" subject.
 */
export async function getEmailMessageId(
  resendId: string,
): Promise<string | null> {
  const result = await resendFetch(
    `${RESEND_ENDPOINT}/${encodeURIComponent(resendId)}`,
  );
  if (!result.ok) return null;
  const body = result.body as { message_id?: unknown };
  const id = typeof body?.message_id === "string" ? body.message_id.trim() : "";
  if (!id) return null;
  return id.startsWith("<") ? id : `<${id}>`;
}
