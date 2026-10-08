"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AddSelfDialog,
  mayAddSelf,
} from "@/components/dashboard/team/add-self-dialog";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { PROGRAM_ROLE_LABEL } from "@/lib/workspace/types";
import { useAdminWizardMode } from "./admin-mode";
import type { RosterOption, RosterSubject } from "./useUploadMatchWizard";

/**
 * The For menu's "Add yourself as a player" offer, and the dialog behind it.
 *
 * Made for the owner, coach or staff member who opens the wizard to upload
 * their own match and finds a roster they are not on. The wizard cannot file a
 * team match against a staff login — that rule stands — so instead of a
 * "Myself" row that would be a refusal, the menu offers the act that makes
 * them a roster player, and picks the new profile once it exists.
 *
 * Offered only when every part of that is true: a team workspace, a non-player
 * role, a roster that has LOADED, and no row on it bound to this login. While
 * the list is loading or failed there is no offer — "not on the roster yet"
 * would be a claim made from nothing.
 *
 * Lives outside `SourceStepContent` because that module's import list is
 * pinned by `tests/upload-source.spec.ts`, which runs it in a VM; the step
 * takes the offer as data and draws the row with what it already imports.
 */
export function useAddSelfOffer(whoPlayed: {
  programId: string | null;
  roster: RosterOption[] | null;
  chooseAdded: (subject: RosterSubject) => void;
}): {
  offer: { roleLabel: string; onOpen: () => void } | null;
  dialog: React.ReactNode;
} {
  const { active, viewer } = useWorkspace();
  const admin = useAdminWizardMode();
  const [open, setOpen] = useState(false);

  // The workspace as it is NOW, for a callback that fires after an await: a
  // switch made while the action was in flight must not have this install a
  // profile from the program that was on screen when the button was pressed.
  const activeIdRef = useRef(active.id);
  useEffect(() => {
    activeIdRef.current = active.id;
  }, [active.id]);

  const eligible =
    !admin &&
    active.kind === "team" &&
    // The roster on screen can belong to a different program than the
    // switcher's — an attached line pins the wizard to its match's program —
    // and the dialog spends a seat in `active`. Offered only when they agree.
    whoPlayed.programId === active.id &&
    whoPlayed.roster !== null &&
    mayAddSelf(
      active.role,
      whoPlayed.roster.some((row) => row.userId === viewer.id),
    );

  // Stable identity: `SourceStepContent` is memoised and takes this as a prop.
  const role = active.role;
  const offer = useMemo(
    () =>
      eligible
        ? { roleLabel: PROGRAM_ROLE_LABEL[role], onOpen: () => setOpen(true) }
        : null,
    [eligible, role],
  );

  return {
    offer,
    // Mounted while open even after the offer disappears — the roster reload
    // that follows a success removes the offer before the dialog has closed.
    dialog:
      eligible || open ? (
        <AddSelfDialog
          open={open}
          onOpenChange={setOpen}
          programId={active.id}
          viewerName={viewer.name}
          teamName={active.name}
          // The action revalidates the dashboard layout, which is what
          // refreshes the workspace's `myPlayerId`; nothing to refresh here.
          onAdded={(added) => {
            if (activeIdRef.current !== active.id) return;
            whoPlayed.chooseAdded({
              kind: "roster",
              playerId: added.profileId,
              name: added.name,
            });
          }}
        />
      ) : null,
  };
}
