import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ConnectionsSettings } from "@/components/dashboard/settings/connections-settings";
import { listOAuthGrants } from "@/lib/auth/oauth-grants";
import { mcpOrigin } from "@/lib/services/mcp/origin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Connections" };

/**
 * Settings › Connections — how to use Advantage from your own Claude (the
 * Ask MCP connector, docs/ask-mcp-connector.md) and the apps you approved,
 * each with Disconnect. Picked on `/design/settings/connections` (layout B).
 *
 * The grants are read with the viewer's own access token from Supabase
 * Auth's OAuth server (`oauth-grants.ts`); a failed read draws the
 * instructions and a one-line error in place of the list, never an empty
 * list that would say nothing is connected.
 */
export default async function ConnectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const grants = session
    ? await listOAuthGrants({
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        accessToken: session.access_token,
      })
    : null;

  return (
    <ConnectionsSettings
      mcpUrl={`${mcpOrigin(await headers())}/api/mcp`}
      grants={grants?.ok ? grants.value : null}
      error={grants && !grants.ok ? grants.message : null}
    />
  );
}
