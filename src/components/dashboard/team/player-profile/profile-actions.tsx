"use client";

import { useState } from "react";
import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";
import { EditPlayerDialog } from "@/components/dashboard/team/edit-player-dialog";
import type { RosterMember } from "@/lib/data/team-roster-server";

/**
 * The identity row's button slot: a ghost, then the primary.
 *
 * Two verbs for one slot, deliberately different (Platform Audit `Te` vs
 * `Te2`). A player owns their own identity — name, handedness, photo one
 * day — so **Edit profile** takes them to Settings → Profile, which edits
 * the `users` row. Class year, lineup position and everything else that
 * ranks a roster is a coach permission, so **Edit player** opens the
 * roster's own dialog against the `program_players` row. Same slot, two
 * scopes, no overlap: a staff member never gets the first and a player never
 * gets the second.
 *
 * **New match** is the primary on both, gated by `canUploadForProgram` at
 * the page — the same predicate the upload wizard enforces, so this never
 * opens a door the next page closes. Absent rather than disabled: a button
 * that refuses on click is worse than no button. It carries `?player=` so
 * the wizard opens with this page's athlete already in its For field; the
 * wizard re-checks that id against the roster and still asks for the source.
 */
export function ProfileActions({
  mode,
  member,
  roster,
  canUpload,
  playerId,
}: {
  /** `self`: the viewer's own page. `staff`: someone with roster rights. `viewer`: a teammate. */
  mode: "self" | "staff" | "viewer";
  /**
   * The roster row behind this profile, for Edit player — and, with it, the
   * rest of the squad the dialog needs to say who else holds a lineup spot.
   * Both are null/empty unless this viewer can actually open that dialog: a
   * `RosterMember` carries its own recent matches and measures, so handing
   * the whole squad to a page that cannot edit anybody would serialise tens
   * of kilobytes to the browser for a control that never renders.
   */
  member: RosterMember | null;
  roster: RosterMember[];
  canUpload: boolean;
  /** This page's athlete, as a `program_players.id` — what `player1_id` wants. */
  playerId: string;
}) {
  const [editing, setEditing] = useState<RosterMember | null>(null);

  const canEditPlayer =
    mode === "staff" && member !== null && member.role === "player";

  return (
    <div className="flex shrink-0 items-center gap-2">
      {mode === "self" && (
        <Link href="/dashboard/settings/profile" className={advButton("ghost")}>
          Edit profile
        </Link>
      )}
      {canEditPlayer && (
        <button
          type="button"
          onClick={() => setEditing(member)}
          className={advButton("ghost")}
        >
          Edit player
        </button>
      )}
      {canUpload && (
        <Link
          href={`/dashboard/matches/new?player=${playerId}`}
          className={advButton("primary")}
        >
          New match
        </Link>
      )}

      {canEditPlayer && (
        <EditPlayerDialog
          member={editing}
          roster={roster}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
    </div>
  );
}
