"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Merge, MoreHorizontal, Trash2 } from "lucide-react";

import { AdminBackLink } from "@/components/admin/admin-back-link";
import { ConferenceCrestControl } from "@/components/admin/conference-crest-control";
import { MergeConferenceDialog } from "@/components/admin/merge-conference-dialog";
import {
  DESTRUCTIVE_ICON,
  DESTRUCTIVE_ROW,
  MENU_ROW_ICON,
} from "@/components/admin/request-drawer";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import {
  conferenceMeta,
  type AdminConferenceRow,
} from "@/lib/data/admin-conferences-view";
import { deleteConference } from "@/lib/services/programs/admin-conference-actions";
import { actionRejected } from "@/lib/ui/action-rejected";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * The Admin › Conferences detail page's header, in `TeamPageHeader`'s shape:
 * a way back to Conferences with the page's `⋯` menu on the same line, then
 * the crest — the live `ConferenceCrestControl` (upload, replace, adjust,
 * remove) — the name and the `conferenceMeta()` line under it.
 *
 * A client component, unlike the team header: the crest control reports its
 * refusals through `onError`, and the menu, the merge dialog and the delete
 * confirm all hold state.
 *
 * ── The `⋯` menu holds Merge into… and Delete, and no rename ────────────────
 * Renaming is the Name field of Details' Edit dialog: one editor, as on the
 * team page. Delete is offered only while no team points here; a populated
 * conference gets the drawer's `FloatMenuNote` in its place rather than a
 * disabled row, so the menu says why instead of offering a dead control. The
 * RPC refuses a delete regardless (`P0001`), and that sentence is shown in the
 * confirm's problem slot, never swallowed.
 *
 * A merge lands on the conference that survived (`/admin/conferences/<id>`);
 * a delete goes back to the list, since this page no longer has a subject.
 */
export function ConferencePageHeader({
  conference,
  conferences,
}: {
  conference: AdminConferenceRow;
  /** Every conference — the merge dialog's typeahead runs over these. */
  conferences: readonly AdminConferenceRow[];
}) {
  const router = useRouter();
  const meta = conferenceMeta(conference);

  const [crestError, setCrestError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleting] = useTransition();

  const remove = () => {
    startDeleting(async () => {
      setDeleteError(null);
      const result = await deleteConference(conference.id).catch(
        actionRejected,
      );
      if (!result.ok) {
        // The RPC's own sentence ("This conference still has N teams — …").
        setDeleteError(result.error);
        return;
      }
      setDeleting(false);
      router.push("/admin/conferences");
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-4">
        <AdminBackLink href="/admin/conferences">Conferences</AdminBackLink>

        <ChromeTooltip label="Conference actions" hidden={menuOpen}>
          <span className="inline-flex shrink-0">
            <FloatMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              width={244}
              label="Conference actions"
              trigger={
                <button
                  type="button"
                  aria-label="Conference actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className={cn(advButton("outline", "sm"), "size-8 p-0")}
                >
                  <MoreHorizontal
                    className="size-[15px]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </button>
              }
            >
              <FloatMenuItem
                label="Merge into…"
                description="Moves every team, then removes this one."
                icon={
                  <Merge
                    className={MENU_ROW_ICON}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                }
                onSelect={() => {
                  setMenuOpen(false);
                  setMerging(true);
                }}
              />
              {conference.teams === 0 ? (
                <>
                  <FloatMenuDivider />
                  <FloatMenuItem
                    label="Delete"
                    icon={
                      <Trash2
                        className={cn(MENU_ROW_ICON, DESTRUCTIVE_ICON)}
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    }
                    className={DESTRUCTIVE_ROW}
                    onSelect={() => {
                      setMenuOpen(false);
                      setDeleteError(null);
                      setDeleting(true);
                    }}
                  />
                </>
              ) : (
                // Draws its own hairline above.
                <FloatMenuNote>
                  Delete is available once no team points here — merge it into
                  another conference first.
                </FloatMenuNote>
              )}
            </FloatMenu>
          </span>
        </ChromeTooltip>
      </div>

      <div className="flex min-w-0 items-center gap-4">
        <ConferenceCrestControl
          name={conference.name}
          shortName={conference.shortName}
          crestUrl={conference.crestUrl}
          conferenceId={conference.id}
          onChanged={() => router.refresh()}
          onError={setCrestError}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-display [text-wrap:balance] break-words">
            {conference.name}
          </h1>
          {meta && <p className="text-[12px] text-[var(--ink-600)]">{meta}</p>}
        </div>
      </div>
      {crestError && (
        <p
          role="alert"
          className="text-[12px] leading-[18px] text-[var(--danger)]"
        >
          {crestError}
        </p>
      )}

      <MergeConferenceDialog
        open={merging}
        onOpenChange={setMerging}
        source={conference}
        conferences={conferences}
        onMerged={(targetId) =>
          router.push(`/admin/conferences/${encodeURIComponent(targetId)}`)
        }
      />

      <ConfirmDialog
        open={deleting}
        onOpenChange={(next) => {
          if (deletePending) return;
          setDeleting(next);
          if (!next) setDeleteError(null);
        }}
        tone="danger"
        title={`Delete ${conference.name}?`}
        description="It leaves the directory. No team points here, so nothing else changes."
        confirmLabel="Delete conference"
        pendingLabel="Deleting…"
        pending={deletePending}
        error={deleteError}
        onConfirm={remove}
      />
    </div>
  );
}
