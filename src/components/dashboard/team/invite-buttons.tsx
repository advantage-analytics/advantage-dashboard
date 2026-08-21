"use client";

import { useState } from "react";
import { advButton } from "@/lib/ui/adv-button";
import { InviteDialog, type InviteKind } from "./invite-dialog";

/**
 * The Roster page's way into the invite dialog.
 *
 * `InviteDialog` is controlled — it takes the kind being invited and reports
 * closing — so something has to hold that state. On the team home that is
 * `FirstSteps`; here it is this, which exists only so the Roster page can stay
 * a server component and still open a dialog.
 *
 * Two buttons rather than one with a menu. Player and staff are different
 * invitations with different copy and different defaults behind them, and a
 * menu would hide that behind a click for no gain at two options.
 */
export function InviteButtons({
  playersCanUpload,
}: {
  playersCanUpload: boolean;
}) {
  const [inviting, setInviting] = useState<InviteKind | null>(null);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className={advButton("primary")}
          onClick={() => setInviting("player")}
        >
          Invite players
        </button>
        <button
          type="button"
          className={advButton("outline")}
          onClick={() => setInviting("staff")}
        >
          Invite staff
        </button>
      </div>

      <InviteDialog
        kind={inviting}
        playersCanUpload={playersCanUpload}
        onOpenChange={(open) => {
          if (!open) setInviting(null);
        }}
      />
    </>
  );
}
