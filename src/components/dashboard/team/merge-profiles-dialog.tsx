"use client";

import { useEffect, useState, useTransition } from "react";
import {
  BarChart3,
  Check,
  Info,
  Loader2,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import {
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { advButton } from "@/lib/ui/adv-button";
import {
  mergeProfiles,
  previewMerge,
  type MergePreview,
} from "@/components/dashboard/team/roster-actions";
import {
  DialogInfoRow,
  DialogProblem,
  RosterDialog,
} from "@/components/dashboard/team/dialog-shell";
import { normalizedPersonName } from "@/lib/data/person-name";
import type { RosterMember } from "@/lib/data/team-roster-server";

/**
 * Design 7e — merge two roster rows that are the same athlete.
 *
 * A repair tool, not a flow. Everything upstream exists so a coach never opens
 * this: the invitation targets a profile, and the email tripwire refuses the
 * duplicate before it can be created. This is for the one that slips through —
 * somebody who signed up with a different address than the coach recorded.
 *
 * ── Guarded on purpose ──────────────────────────────────────────────────────
 * The research brief found merge is always guarded and lossy where it exists,
 * and one product forbids it outright. So: the two names must already match,
 * the operator types the name to confirm, both-claimed is refused, and there is
 * no undo. The numbers below come from `preview_program_player_merge` rather
 * than from counting rows in the browser — what a coach approves should be what
 * happens.
 */

/** Which of the two rows survives. Everything else follows from this. */
type KeepChoice = "a" | "b";

export function MergeProfilesDialog({
  pair,
  onOpenChange,
}: {
  /** The two rows, or null when closed. */
  pair: [RosterMember, RosterMember] | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [keep, setKeep] = useState<KeepChoice>("a");
  const [confirmName, setConfirmName] = useState("");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /**
   * A row with an account is the one to keep by default: a login cannot be
   * moved anywhere, while matches can.
   *
   * Adjusted DURING render rather than in an effect. React re-runs the
   * component before committing, so the dialog never paints one pair's state
   * over another's — where an effect would flash the previous selection for a
   * frame. It is also what the lint rule asks for.
   */
  const pairKey = pair ? `${pair[0].playerId}:${pair[1].playerId}` : "";
  const [lastPairKey, setLastPairKey] = useState(pairKey);
  if (pairKey !== lastPairKey) {
    setLastPairKey(pairKey);
    setKeep(pair && pair[0].managedBy === "self" ? "a" : "b");
    setConfirmName("");
    setError(null);
  }

  const surviving = pair ? (keep === "a" ? pair[0] : pair[1]) : null;
  const absorbed = pair ? (keep === "a" ? pair[1] : pair[0]) : null;

  // "2 matches move" is a different sentence in each direction, so a stale
  // number would be a coach approving something other than what they read.
  // Cleared during render for the same reason as above.
  const directionKey =
    surviving && absorbed ? `${surviving.playerId}>${absorbed.playerId}` : "";
  const [lastDirection, setLastDirection] = useState(directionKey);
  if (directionKey !== lastDirection) {
    setLastDirection(directionKey);
    setPreview(null);
  }

  useEffect(() => {
    if (!directionKey) return;
    const [survivingId, absorbedId] = directionKey.split(">");
    // `live` guards the classic slow-early-response race: flip the direction
    // twice quickly and the first reply must not overwrite the second.
    let live = true;
    previewMerge(survivingId, absorbedId).then((result) => {
      if (!live) return;
      if (result.ok) setPreview(result.preview);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [directionKey]);

  if (!pair || !surviving || !absorbed) return null;

  const bothClaimed =
    pair[0].managedBy === "self" && pair[1].managedBy === "self";
  const ready =
    !bothClaimed &&
    preview !== null &&
    normalizedPersonName(confirmName) ===
      normalizedPersonName(surviving.name);

  function submit() {
    if (!surviving || !absorbed) return;
    setError(null);
    start(async () => {
      const result = await mergeProfiles({
        survivingId: surviving.playerId,
        absorbedId: absorbed.playerId,
        confirmName: confirmName.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <RosterDialog
      open
      onOpenChange={onOpenChange}
      width={520}
      title="Merge duplicate profiles"
      description={`${surviving.name} appears twice on this roster. Merging moves everything onto one profile and retires the other.`}
      footer={
        <>
          <div className="flex-1" />
          <button
            type="button"
            className={advButton("outline")}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          {/* Destructive and unrepeatable, so it is not dressed as the
              ordinary primary. The design system keeps a filled danger for
              exactly this: an action whose cost the person has already read. */}
          <button
            type="button"
            className={advButton("danger-solid")}
            disabled={!ready || pending}
            onClick={submit}
          >
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Merge profiles
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-[var(--ink-600)]">Keep</span>
        <div className="grid grid-cols-2 gap-3">
          {(["a", "b"] as const).map((side) => {
            const member = side === "a" ? pair[0] : pair[1];
            const chosen = keep === side;
            return (
              <button
                key={side}
                type="button"
                role="radio"
                aria-checked={chosen}
                onClick={() => setKeep(side)}
                className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-element)] border p-3 text-left transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none ${
                  chosen
                    ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                    : "border-[var(--border-field)] hover:bg-[var(--surface-subtle)]"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-px flex size-3.5 shrink-0 items-center justify-center rounded-full ${
                    chosen ? "bg-[var(--blue)]" : "border border-[var(--ink-300)]"
                  }`}
                >
                  {chosen && (
                    <Check className="size-2 text-white" strokeWidth={3} aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-[var(--ink-900)]">
                    {member.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-[1.5] text-[var(--ink-600)]">
                    {member.managedBy === "self" ? "Self-managed" : "Coach-managed"}{" "}
                    · <span className="tabular">{member.matchesPlayed}</span>{" "}
                    {member.matchesPlayed === 1 ? "match" : "matches"}
                    <br />
                    {member.email ?? "No email on file"}
                  </span>
                  {member.managedBy === "self" && (
                    <span className="text-micro mt-1 block">Keeps the login</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {bothClaimed ? (
        <DialogInfoRow
          icon={<Info className="size-3.5" strokeWidth={1.5} aria-hidden />}
        >
          Both of these have an account, so this is a roster change rather than a
          duplicate. Remove whichever one should not be here instead.
        </DialogInfoRow>
      ) : (
        <>
          <div className="flex flex-col">
            <span className="pb-1.5 text-[11px] text-[var(--ink-600)]">
              What moves
            </span>
            <MoveRow icon={<Video className="size-3" strokeWidth={1.5} />}>
              <span className="tabular">{preview?.matchesMoving ?? "…"}</span>{" "}
              {preview?.matchesMoving === 1 ? "match" : "matches"} and their video
              → {surviving.name}
            </MoveRow>
            <MoveRow icon={<BarChart3 className="size-3" strokeWidth={1.5} />}>
              Season stats recompute on the next load — no double counting
            </MoveRow>
            <MoveRow icon={<Upload className="size-3" strokeWidth={1.5} />}>
              Upload credits kept — matches still show who added them
            </MoveRow>
            <MoveRow icon={<Trash2 className="size-3" strokeWidth={1.5} />}>
              The {absorbed.managedBy === "self" ? "self-managed" : "coach-managed"}{" "}
              row is retired
            </MoveRow>
          </div>

          <SettingsField
            label="Type the name to confirm"
            hint={`Exactly as it reads: ${surviving.name}`}
          >
            <SettingsUnderlineInput
              value={confirmName}
              placeholder={surviving.name}
              onChange={(event) => setConfirmName(event.target.value)}
            />
          </SettingsField>

          <DialogProblem message={error} />

          <DialogInfoRow
            icon={<Info className="size-3.5" strokeWidth={1.5} aria-hidden />}
          >
            Names must match · logged in team activity · cannot be undone
          </DialogInfoRow>
        </>
      )}
    </RosterDialog>
  );
}

/** One hairline-separated line in the "what moves" list. */
function MoveRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-[var(--border-hairline)] py-2">
      <span aria-hidden className="shrink-0 text-[var(--ink-500)]">
        {icon}
      </span>
      <span className="text-[12px] text-[var(--ink-700)]">{children}</span>
    </div>
  );
}
