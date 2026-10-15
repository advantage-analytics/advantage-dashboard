import { redirect } from "next/navigation";
import FormHeader from "@/components/auth/form-header";
import AuthFooter from "@/components/auth/auth-footer";
import { errorHref } from "@/lib/auth/confirm-link";
import {
  consentPath,
  getOAuthAuthorizationDetails,
  MISSING_AUTHORIZATION_ERROR,
  readAuthorizationId,
} from "@/lib/auth/oauth-consent";
import { createClient } from "@/lib/supabase/server";
import { decideOAuthConsent } from "./actions";
import { DecisionButtons } from "./decision-buttons";

export const metadata = { title: "Connect an app" };

/**
 * The OAuth 2.1 consent screen — Supabase Auth's "authorization path" for
 * this project (docs/ask-mcp-connector.md). A third-party client (a
 * Claude connecting to `/api/mcp`) sends the person here with an
 * `authorization_id`; this page says who is asking and what they would
 * get, and the two buttons tell Supabase the decision through a Server
 * Action (`actions.ts`), which redirects back to the client.
 *
 * Signed-out visitors go to `/login` with this page as `next`, so the
 * request survives the sign-in. A request the person already approved
 * answers with a redirect URL instead of details, and is followed at once.
 *
 * The GET does nothing but read: as on `/confirm`, nothing is decided until
 * a button is pressed, so a link fetched by a scanner changes nothing.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const authorizationId = readAuthorizationId(params.authorization_id);
  if (!authorizationId) redirect(errorHref(MISSING_AUTHORIZATION_ERROR));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(consentPath(authorizationId))}`);
  }
  // The access token the consent calls carry: the session's, read only
  // after `getUser()` has verified it against Supabase Auth.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(consentPath(authorizationId))}`);
  }

  const read = await getOAuthAuthorizationDetails({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    accessToken: session.access_token,
    authorizationId,
  });
  if (!read.ok) redirect(errorHref(read.message));
  if (read.value.kind === "redirect") redirect(read.value.redirectUrl);
  const request = read.value;

  let returnsTo: string | null = null;
  try {
    returnsTo = request.redirectUri ? new URL(request.redirectUri).host : null;
  } catch {
    returnsTo = null;
  }

  return (
    <div
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <FormHeader
        eyebrow="Connect an app"
        title="Allow Access to Your Matches."
        description={
          <>
            <span className="text-[var(--ink-900)]">{request.client.name}</span>{" "}
            wants to use Ask on your behalf, signed in as {user.email}.
          </>
        }
      />

      <dl className="flex flex-col gap-[16px]">
        <div className="flex flex-col gap-[6px]">
          <dt className="eyebrow">It can</dt>
          <dd className="text-body-sm">
            List your matches and their scores, run read-only queries over your
            statistics, and ask questions that spend your monthly Ask allowance.
          </dd>
        </div>
        <div className="flex flex-col gap-[6px]">
          <dt className="eyebrow">It cannot</dt>
          <dd className="text-body-sm">
            Upload, edit or delete anything, or see another player&apos;s data.
          </dd>
        </div>
        {returnsTo ? (
          <div className="flex flex-col gap-[6px]">
            <dt className="eyebrow">Returns to</dt>
            <dd className="text-body-sm font-mono">{returnsTo}</dd>
          </div>
        ) : null}
      </dl>

      <form action={decideOAuthConsent} className="flex flex-col gap-[16px]">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <DecisionButtons />
        <AuthFooter>
          <span className="text-micro max-w-[44ch]">
            Nothing is shared until you press Allow. Removing the connector from{" "}
            {request.client.name} stops it from using this access.
          </span>
        </AuthFooter>
      </form>
    </div>
  );
}
