"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

import { AdminTeamDetailsDialog } from "@/components/admin/admin-team-details-dialog";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { adminRemoveProgramCrest } from "@/lib/services/programs/admin-team-actions";
import type { AdminTeamProgram } from "@/lib/data/admin-team-server";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * The two controls at the right of the Admin › Teams detail header: the
 * outline `Edit details` button and the `⋯` menu beside it.
 *
 * Its own client component rather than markup inside `team-page-header.tsx`,
 * which is a Server Component and stays one — it reads `programSubtitle` from
 * a `*-server.ts` module, and both of these controls need state (a dialog, a
 * popover, a pending action).
 *
 * ── The menu holds three rows and no fourth ─────────────────────────────────
 * `Remove crest`, `Change conference`, `View in Teams list`. Nothing
 * destructive beyond the crest lives here: deleting a program, ending a
 * pilot or removing a member are each owned by the surface that can also say
 * what they cost, and a `⋯` menu is the one place in a console where an
 * irreversible action has no room to explain itself.
 *
 * `Remove crest` is hidden, not disabled, on a program with no crest — a
 * dimmed row reads as "you may not", where the truth is "there is nothing to
 * remove". It is the reachable half of `CrestControl`'s pair: the header
 * variant's badge uploads only, so without this row an admin could put a
 * crest on a program and never take it off again. Its refusals print under
 * the header, out of flow, for the same reason the crest control's do — a
 * message in the row would shove the program's name sideways.
 *
 * `Change conference` scrolls to the Conference card rather than repeating
 * its picker: the card owns that control, and two ways to set one column is
 * how the two come to disagree. `View in Teams list` is a plain link to
 * `/admin/teams` — that page reads `view`, `sort`, `after` and the three cut
 * params off the URL and has nothing that selects or highlights one row, and
 * a parameter nothing consumes would be a promise the list does not keep.
 */
export function TeamHeaderActions({ program }: { program: AdminTeamProgram }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();

  const removeCrest = () => {
    setMenuOpen(false);
    setError(null);
    startRemoving(async () => {
      const result = await adminRemoveProgramCrest(program.id);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="relative flex shrink-0 items-center gap-2.5">
      <button
        type="button"
        className={advButton("outline", "md")}
        onClick={() => setEditing(true)}
      >
        Edit details
      </button>

      <FloatMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        label="More team actions"
        width={212}
        trigger={
          <button
            type="button"
            aria-label="More team actions"
            aria-expanded={menuOpen}
            className={cn(advButton("outline", "md"), "size-9 p-0")}
          >
            <MoreHorizontal
              className="size-[15px]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
        }
      >
        {program.crestUrl && (
          <FloatMenuItem
            label={removing ? "Removing crest…" : "Remove crest"}
            disabled={removing}
            onSelect={removeCrest}
          />
        )}
        <FloatMenuItem
          label="Change conference"
          onSelect={() => {
            setMenuOpen(false);
            window.location.hash = "conference";
          }}
        />
        <FloatMenuItem
          label="View in Teams list"
          onSelect={() => {
            setMenuOpen(false);
            router.push("/admin/teams");
          }}
        />
      </FloatMenu>

      <AdminTeamDetailsDialog
        program={program}
        open={editing}
        onOpenChange={setEditing}
      />

      {error && (
        <p
          role="alert"
          className="absolute top-full right-0 mt-2 text-[11px] whitespace-nowrap text-[var(--danger)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
