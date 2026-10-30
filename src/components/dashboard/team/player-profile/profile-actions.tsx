"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import { EditPlayerDialog } from "@/components/dashboard/team/edit-player-dialog";
import { mayRemoveStaffProfile } from "@/components/dashboard/team/staff-profile-rules";
import { ROSTER_PATH } from "@/components/dashboard/team/roster-table";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
} from "@/components/ui/float-menu";
import {
  DESTRUCTIVE_ICON,
  DESTRUCTIVE_ROW,
  MENU_ROW_ICON,
} from "@/components/dashboard/matches/match-actions/menu-row-classes";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { cn } from "@/lib/utils";
import type { RosterMember } from "@/lib/data/team-roster-server";

/** The match report's title-row icon button (`MatchReportAskLink`), so Ask and ⋯ match it. */
const ICON_BUTTON =
  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-button)] text-[var(--ink-600)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]";

/**
 * The identity row's action slot: Ask, ⋯, then the primary.
 *
 * Both quiet controls are the match report's own (`report-title-row.tsx`,
 * `report-more-menu.tsx`): borderless 32px icon buttons with a dark tooltip,
 * so a page about a player and a page about a match carry their actions the
 * same way.
 *
 * **Ask** is the sidebar's `MessageSquare` linking into the team's Ask page
 * with this player tagged (`askHref`, from `askEntryHref`). Its tooltip names
 * who it asks about — "Ask about Maya", or "Ask about your matches" on the
 * viewer's own page.
 *
 * **⋯** holds what changes the player, as every other ⋯ in the dashboard
 * does (match report, match rows, schedule events, the roster drawer). Two
 * scopes, no overlap:
 * - a coach gets **Edit player** — the roster's dialog against the
 *   `program_players` row — and, below a hairline, **Remove from roster**,
 *   which opens the same dialog on its confirm step. Removing archives the
 *   profile, so this page would 404 on its next render; the step says so, and
 *   success replaces the history entry with the roster. The row is offered
 *   only where `archive_program_player` would allow it (`mayRemoveStaffProfile`).
 * - the player gets **Edit profile**, which goes to Settings → Profile (the
 *   `users` row). One row, kept in the menu so the control sits where it does
 *   on every page.
 * A teammate reading the page gets no menu: nothing here is theirs to edit.
 *
 * **New match** is the primary on both, gated by `canUploadForProgram` at
 * the page — the same predicate the upload wizard enforces, so this never
 * opens a door the next page closes. Absent rather than disabled: a button
 * that refuses on click is worse than no button. Its href carries `?player=`
 * so the wizard opens with this page's athlete already in its For field; the
 * wizard re-checks that id against the roster and still asks for the source.
 */
export function ProfileActions({
  mode,
  member,
  roster,
  canUpload,
  newMatchHref,
  askHref = null,
  askSubject,
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
  /** The wizard for this page's athlete — built once by the page. */
  newMatchHref: string;
  /** The team's Ask page with this player tagged, or null to draw no link. */
  askHref?: string | null;
  /** The player's first name, for the tooltip's words; "your matches" on the viewer's own page. */
  askSubject?: string;
}) {
  const router = useRouter();
  const { active, viewer } = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<{
    member: RosterMember;
    startAt: "edit" | "confirm";
  } | null>(null);

  const canEditPlayer =
    mode === "staff" && member !== null && member.role === "player";
  // The dialog's own Remove rule, so the menu never offers a row it refuses.
  const canRemove =
    canEditPlayer &&
    (!member.staffRole ||
      mayRemoveStaffProfile(
        active.role,
        member.staffRole,
        member.userId === viewer.id,
      ));
  const hasMenu = mode === "self" || canEditPlayer;

  const askLabel =
    mode === "self"
      ? "Ask about your matches"
      : `Ask about ${askSubject ?? "this player"}`;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {askHref && (
        <ChromeTooltip label={askLabel}>
          <Link
            href={askHref}
            aria-label={askLabel}
            data-ask-about="player"
            className={ICON_BUTTON}
          >
            <MessageSquare
              className="size-4"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </Link>
        </ChromeTooltip>
      )}

      {hasMenu && (
        <ChromeTooltip label="More" hidden={menuOpen || editing !== null}>
          {/* The tooltip and the popover each want to own the trigger's props
              (both are `asChild`), so the tooltip anchors to this span, as in
              `MatchReportMoreMenu`. */}
          <span className="inline-flex">
            <FloatMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              width={212}
              align="end"
              label="More"
              trigger={
                <button
                  type="button"
                  aria-label="More"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className={ICON_BUTTON}
                >
                  <MoreHorizontal
                    className="size-4"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>
              }
            >
              {mode === "self" ? (
                <FloatMenuItem
                  label="Edit profile"
                  icon={
                    <Pencil
                      className={MENU_ROW_ICON}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  }
                  onSelect={() => {
                    setMenuOpen(false);
                    router.push("/dashboard/settings/profile");
                  }}
                />
              ) : (
                canEditPlayer && (
                  <>
                    <FloatMenuItem
                      label="Edit player"
                      icon={
                        <Pencil
                          className={MENU_ROW_ICON}
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      }
                      onSelect={() => {
                        setMenuOpen(false);
                        setEditing({ member, startAt: "edit" });
                      }}
                    />
                    {canRemove && (
                      <>
                        <FloatMenuDivider />
                        <FloatMenuItem
                          label="Remove from roster"
                          icon={
                            <Trash2
                              className={cn(MENU_ROW_ICON, DESTRUCTIVE_ICON)}
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                          }
                          className={DESTRUCTIVE_ROW}
                          onSelect={() => {
                            setMenuOpen(false);
                            setEditing({ member, startAt: "confirm" });
                          }}
                        />
                      </>
                    )}
                  </>
                )
              )}
            </FloatMenu>
          </span>
        </ChromeTooltip>
      )}

      {canUpload && (
        <Link href={newMatchHref} className={cn(advButton("primary"), "ml-2")}>
          New match
        </Link>
      )}

      {canEditPlayer && (
        <EditPlayerDialog
          // Keyed on the step so reopening on the other one starts there.
          key={editing?.startAt ?? "edit"}
          member={editing?.member ?? null}
          roster={roster}
          startAt={editing?.startAt ?? "edit"}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onRemoved={() => router.replace(ROSTER_PATH)}
        />
      )}
    </div>
  );
}
