"use server";

import { createClient } from "@/lib/supabase/server";
import { verifyHref } from "./pilot-terms";
import {
  claimTermsVersion,
  pendingClaimProgramKey,
  recordTermsAcceptance,
  type AcceptPilotTermsResult,
} from "./pilot-terms-server";

/**
 * The college terms screen's submit: accept, then go back through
 * `/claim/verify` to finish the claim the emailed link started.
 *
 * The one export, because everything a `"use server"` module exports is
 * callable from a browser. Reading an acceptance, recording one and deciding
 * which version a claim needs live in `pilot-terms-server.ts`, where no
 * browser can pass them a version of its choosing.
 *
 * The version accepted is the one THIS claim is made under, resolved here
 * from the session and the pending claim (`claimTermsVersion`), exactly as
 * the screen resolved it to render. `version` is only what the screen showed:
 * if it is not that one, nothing is recorded and the screen re-renders.
 *
 * `token` is the signed-in link's `?token=`, carried here from the screen so
 * the claim finishes by the same path it arrived on. It is only ever put back
 * into a query string on a fixed path, never used to build a URL of its own,
 * so a crafted value can at worst finish no claim (`completeClaimWithToken`
 * checks it by hash against the session that started the claim).
 *
 * Returns the verify URL rather than calling `redirect()`. `/claim/verify` is a
 * Route Handler that itself redirects (to `/claim/review` or `/claim/ready`),
 * and a server action's redirect is followed as a client-side navigation: the
 * router fetched the handler, followed its redirect inside that fetch, and
 * rendered the review screen while the address bar still read
 * `/claim/verify?token=…`. A refresh there re-ran verify with a spent token.
 * The form does a full `window.location` navigation to this URL instead, so
 * the handler runs as an ordinary page load and its redirect lands in the
 * address bar.
 */
export async function acceptPilotTermsForClaim(input: {
  version: string;
  token?: string | null;
}): Promise<AcceptPilotTermsResult> {
  const token =
    typeof input?.token === "string" && input.token ? input.token : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no-session" };

  const expected = await claimTermsVersion(
    supabase,
    await pendingClaimProgramKey(user, token),
  );
  const result = await recordTermsAcceptance(input?.version, expected);
  if (!result.ok) return result;

  return { ok: true, next: verifyHref(token) };
}
