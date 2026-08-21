import {
  FROM_ADDRESS,
  RESEND_ENDPOINT,
  RESEND_SUPPRESSION_ENDPOINT,
  SEND_TIMEOUT_MS,
} from "./config";

/**
 * The one place this application sends mail from.
 *
 * SERVER ONLY. `RESEND_API_KEY` is unprefixed, so it is undefined in the
 * browser and every send from a client component would silently take the
 * "no key" branch and print to a console nobody is reading — a failure that
 * looks exactly like success. The callers are server actions, which are easy
 * to mistake for client code because they live in files the client imports
 * from, so check where you are calling this before you add a caller.
 *
 * The rest of `lib/services/**` carries the same constraint the same way, by
 * convention rather than by the `server-only` package, which is not a
 * dependency of this project.
 */

export type EmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Always send one — see `renderText`. */
  text: string;
  /**
   * Resend tags, for filtering the log later. Keys and values are restricted
   * to ASCII letters, numbers, underscores and dashes on their side; anything
   * else is rejected for the whole message, so keep them machine-shaped.
   */
  tags?: Record<string, string>;
}

/**
 * Send one email. Never throws.
 *
 * Every caller here is a server action a person is waiting on, and every one
 * of them has already written its row by the time it calls. A throw would
 * unwind past work that is already durable — the invite exists whether or not
 * the mail goes out, and the resend path is what recovers it. So this returns
 * the failure and lets the caller decide what to say.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) return logInsteadOfSending(message);

  // Asked BEFORE sending, because afterwards is too late to find out.
  if (await isSuppressed(message.to, apiKey)) {
    console.warn("[email] refusing a suppressed recipient", {
      to: redactAddress(message.to),
      subject: message.subject,
    });
    return {
      ok: false,
      error:
        "That address is on the do-not-send list, so mail to it is dropped. Use another address, or remove it from the suppression list.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.tags
          ? {
              tags: Object.entries(message.tags).map(([name, value]) => ({
                name,
                value,
              })),
            }
          : {}),
      }),
      signal: controller.signal,
    });

    // Read the body once, as text, before deciding anything. A non-2xx from
    // Resend is JSON, but a gateway between us and them is HTML, and calling
    // .json() on that throws inside the catch-all below where the actual
    // status code — the only useful thing in that case — is already lost.
    const raw = await response.text();

    if (!response.ok) {
      console.error("[email] send refused", {
        status: response.status,
        to: redactAddress(message.to),
        subject: message.subject,
        body: raw.slice(0, 500),
      });
      return { ok: false, error: describeFailure(response.status, raw) };
    }

    let id: string | null = null;
    try {
      id = (JSON.parse(raw) as { id?: string }).id ?? null;
    } catch {
      // A 2xx we cannot parse still means it was accepted. The id is only for
      // correlating with Resend's dashboard later, so losing it is not a
      // failure worth reporting to a coach.
    }

    return { ok: true, id };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error("[email] send failed", {
      to: redactAddress(message.to),
      subject: message.subject,
      reason: aborted ? "timeout" : (error as Error)?.message,
    });
    return {
      ok: false,
      error: aborted
        ? "Sending timed out."
        : "We couldn't reach the mail service.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * No API key — print the mail instead of sending it.
 *
 * The same shape as the LLM adapter's mock stream, and for the same reason:
 * the whole flow stays walkable locally and on a preview deployment without
 * anybody having to hold a credential.
 *
 * It prints the PLAIN TEXT part, not the HTML, and that is the point rather
 * than brevity — the text part carries the link, which is the thing a
 * developer actually needs to continue the flow.
 *
 * Be aware of what that means: for an invite, that console line contains a
 * working token. It is server-side output, so it never reaches a browser, but
 * it does reach anything reading your logs. This is why the branch is keyed on
 * the key being absent rather than on NODE_ENV — a deployment that has the key
 * never takes this path, however it is configured.
 */
function logInsteadOfSending(message: EmailMessage): EmailResult {
  console.warn(
    [
      "",
      "──────────────────────────────────────────────────────────────",
      " EMAIL NOT SENT — RESEND_API_KEY is unset, printing instead",
      "──────────────────────────────────────────────────────────────",
      ` To:      ${message.to}`,
      ` Subject: ${message.subject}`,
      "",
      message.text,
      "──────────────────────────────────────────────────────────────",
      "",
    ].join("\n")
  );

  return { ok: true, id: null };
}

/**
 * Is this address on the account's do-not-send list?
 *
 * ── Why this call exists at all ─────────────────────────────────────────────
 * Sending to a suppressed address does not fail. Resend answers 200, returns a
 * real message id, and then drops the message — the refusal only appears later
 * as `status: suppressed` on the email record, which nothing in a request/
 * response cycle ever reads. So `sendEmail` reported success for mail that was
 * never delivered, `inviteMember` returned no warning, and a coach saw a
 * confirmed invitation that had already been thrown away.
 *
 * That is precisely the failure this module was built to prevent — the whole
 * warning path exists so a failed send is never a green tick — and it slipped
 * through one layer below where the guard was placed. It was found the only
 * way it could be: a real invitation to a real person that never arrived.
 *
 * It matters well past one inbox. A suppression list fills up with addresses
 * from outreach, bounces and unsubscribes, and any coach on it becomes
 * silently un-invitable: the roster reads "outstanding" forever and nobody can
 * see why.
 *
 * ── Fail OPEN, deliberately ─────────────────────────────────────────────────
 * A network error or an unexpected status here returns false — "not
 * suppressed" — and the send proceeds. This check exists to convert a silent
 * drop into a visible warning, not to become a new reason mail cannot go out.
 * If the lookup is down, the worst case is the behaviour we had before it
 * existed; refusing instead would let a blip on a secondary endpoint block
 * every invitation in the product.
 *
 * One extra round trip per send. At invite volume that is nothing, and the
 * thing it buys is the difference between a coach retrying with another
 * address and a coach concluding the product is broken.
 */
async function isSuppressed(to: string, apiKey: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${RESEND_SUPPRESSION_ENDPOINT}/${encodeURIComponent(to)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      }
    );

    if (response.status === 404) return false; // the common, healthy answer
    if (response.ok) return true;

    // Anything else — 401, 429, 5xx — is not an answer about this address.
    console.warn("[email] suppression check inconclusive", {
      status: response.status,
      to: redactAddress(to),
    });
    return false;
  } catch (error) {
    console.warn("[email] suppression check failed", {
      to: redactAddress(to),
      reason: (error as Error)?.message,
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Enough of an address to identify a report, not enough to harvest one. */
function redactAddress(address: string): string {
  const [local, domain] = address.split("@");
  if (!domain) return "(malformed)";
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * What to put in front of the person who pressed the button.
 *
 * Resend's own message is written for whoever holds the API key, not for a
 * coach — "The `to` field must be a valid email" is useful, "API key is
 * invalid" is not something they can act on. So the two cases they CAN act on
 * get their own words and everything else gets one honest sentence.
 *
 * Deliberately says nothing about invites, rosters or programs. This module
 * sends mail; what the mail was for belongs to the caller, which is the only
 * layer that can say what survived the failure and what to do about it.
 */
function describeFailure(status: number, raw: string): string {
  if (status === 422 && /valid.*email|invalid.*to/i.test(raw)) {
    return "That address doesn't look deliverable.";
  }
  if (status === 429) {
    return "Too many emails at once. Try again in a minute.";
  }
  return "The mail service refused the message.";
}
