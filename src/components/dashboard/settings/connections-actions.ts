"use server";

import { revalidatePath } from "next/cache";

import { revokeOAuthGrant } from "@/lib/auth/oauth-grants";
import { createClient } from "@/lib/supabase/server";

import type { ActionResult } from "./actions";

/**
 * Disconnect one app the viewer approved (Settings › Connections). The
 * session is the cookie's, verified through `getUser()` before its token goes
 * to Supabase Auth, so a person can only revoke their own grants: the
 * endpoint revokes for whoever the token belongs to, and the client id only
 * picks which app.
 */
export async function disconnectApp(clientId: string): Promise<ActionResult> {
  if (typeof clientId !== "string" || clientId.trim() === "") {
    return {
      ok: false,
      error: "That app could not be disconnected. Try again.",
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!user || !session) {
    return { ok: false, error: "Your session has ended. Sign in again." };
  }
  const revoked = await revokeOAuthGrant({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    accessToken: session.access_token,
    clientId,
  });
  if (!revoked.ok) return { ok: false, error: revoked.message };
  revalidatePath("/dashboard/settings/connections");
  return { ok: true };
}
