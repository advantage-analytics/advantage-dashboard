"use client";

import { useState } from "react";

import { CrestControl } from "@/components/dashboard/settings/teams/crest-control";
import {
  adminRemoveProgramCrest,
  adminUploadProgramCrest,
} from "@/lib/services/programs/admin-team-actions";

/**
 * The admin team page's crest, as a control.
 *
 * A thin client wrapper rather than a second implementation: `CrestControl`
 * owns the file input, the adjust dialog and the bake-then-post sequence, and
 * it takes the pair of server actions to run. This exists only because that
 * component reports failure through an `onError` callback and the header it
 * sits in is a Server Component, which cannot hand a function across the
 * boundary.
 *
 * The actions are the `admin*` pair — same sequence as the member ones, but
 * authorized on `requireAdmin()` and writing to the member-scoped
 * `program-crests` bucket with the service-role key, because an admin looking
 * at someone else's program is not a member of it.
 *
 * The error line is positioned out of flow: the header is a single centred
 * row, and a message appearing under a 64px mark would otherwise shove the
 * program's name sideways.
 */
export function AdminTeamCrestControl({
  programId,
  name,
  crestUrl,
}: {
  programId: string;
  name: string;
  crestUrl: string | null;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative shrink-0">
      <CrestControl
        variant="header"
        programId={programId}
        name={name}
        crestUrl={crestUrl}
        onError={setError}
        upload={adminUploadProgramCrest}
        remove={adminRemoveProgramCrest}
      />
      {error && (
        <p
          role="alert"
          className="absolute top-full left-0 mt-2 text-[11px] whitespace-nowrap text-[var(--danger)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
