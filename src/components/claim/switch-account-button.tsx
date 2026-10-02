"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLAIM_BUTTON } from "@/components/claim/claim-shell";

/**
 * "Sign out and switch" for the claim link that belongs to another account.
 * This device only (`scope: "local"`) — switching accounts here must never
 * revoke the person's sessions elsewhere.
 */
export function SwitchAccountButton() {
  const [busy, setBusy] = useState(false);

  const switchAccount = async () => {
    setBusy(true);
    await createClient().auth.signOut({ scope: "local" });
    // A full load: every cached route belongs to the session that just ended.
    window.location.assign("/login");
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={switchAccount}
      className={CLAIM_BUTTON}
    >
      Sign out and switch
    </button>
  );
}
