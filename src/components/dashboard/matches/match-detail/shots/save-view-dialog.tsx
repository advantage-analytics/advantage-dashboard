"use client";

import {
  useEffect,
  useId,
  useState,
  useTransition,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { advButton } from "@/lib/ui/adv-button";
import type { FloatMenuTone } from "@/components/ui/float-menu";
import { hasDuplicateViewName } from "@/lib/data/saved-views-logic";
import { createSavedView } from "@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions";
import type { SavedView, SavedViewRow } from "@/lib/data/saved-views-server";
import type { WorkspaceKind } from "@/lib/workspace/types";
import type { Cut, Chart, VizFilters } from "./viz-model";
import { activeFilterEntries } from "./viz-url";
import { CUT_LABEL, CHART_LABEL } from "./viz-labels";
import { cn } from "@/lib/utils";

/**
 * Task 9 step 2: the Save-view popover, opened from the cut menu's "Save
 * this view…" row (`cut-menu.tsx`'s `onSaveRequest`) and anchored under
 * that same trigger button via `PopoverAnchor`'s `virtualRef` — `anchorRef`
 * is the ref `viz-focused.tsx` threads through `VizToolbar`/`CutMenu` onto
 * `VizMenuTrigger`. Only mounted on the focused view (`viz-focused.tsx`);
 * the wall has no cut menu to anchor to.
 *
 * Sharing (user ruling, not in the original task brief): every view is
 * private by default. In a team workspace only, an unchecked "Share with
 * team" row offers to make it visible to the rest of the workspace; a
 * personal workspace has nobody to share with, so the row is absent
 * entirely (`resolveSharedFlag` on the server enforces the same rule
 * regardless of what this dialog sends).
 *
 * Phase 2A: `tone="dark"` draws the fullscreen viewer's Save dialog
 * (f4b-report P2f/P2g — `rgba(13,13,13,.9)`, the field's `rgba(255,255,255,
 * .08)` fill, the "Saves" well already below reused as-is since the light
 * dialog already has one). The duplicate-name copy differs by tone only —
 * dark uses the P2g wording with curly quotes; the validation timing (blur +
 * submit, never per keystroke) is identical for both and unchanged here.
 */
/**
 * The viewer's prefilled name (final review #9): the cut, and the first
 * active filter when there is one — the same two facts the viewer's summary
 * pill shows, so the field opens agreeing with the screen behind it. No
 * filters means the cut label alone; nothing is invented and nothing is
 * forced (the field stays editable, and an empty field still blocks Save the
 * way it always did).
 */
export function suggestedViewName(cut: Cut, filters: VizFilters): string {
  const first = activeFilterEntries({
    cut,
    chart: "scatter",
    filters,
    viewId: null,
  })[0];
  return first ? `${CUT_LABEL[cut]} · ${first.label}` : CUT_LABEL[cut];
}

export function SaveViewDialog({
  open,
  onOpenChange,
  anchorRef,
  cut,
  chart,
  filters,
  savedViews,
  workspaceKind,
  workspaceName,
  onSaved,
  tone = "light",
  side = "bottom",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  cut: Cut;
  chart: Chart;
  filters: VizFilters;
  savedViews: SavedViewRow[];
  workspaceKind: WorkspaceKind;
  workspaceName: string;
  onSaved: (view: SavedView) => void;
  tone?: FloatMenuTone;
  side?: "top" | "bottom";
}) {
  const router = useRouter();
  const dark = tone === "dark";
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nameId = useId();
  const errorId = useId();

  // Every open is a clean slate — a dialog reopened for a different (or the
  // same) view never carries the previous attempt's name, checkbox or error
  // forward. `open` flipping true is an external signal (the cut menu's
  // "Save this view…" row was clicked), not a value derivable from
  // props/state during render, so this is the legitimate case
  // `react-hooks/set-state-in-effect` warns about generally — same
  // justification, and same call, as `saved-views-band.tsx`'s identical
  // suppression on its own "external `views` prop lands" effect.
  //
  // Final review #9: on the DARK tone (the fullscreen viewer) the name starts
  // prefilled with a suggestion — the cut plus its first active filter, which
  // is what the viewer's own summary pill already says, so the field opens
  // agreeing with what is on screen. It is a plain editable default, not a
  // forced name. Light is untouched: the shipped toolbar dialog still opens
  // empty.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external source (dialog opened by a click outside this component), not a render-derivable value
      setName(dark ? suggestedViewName(cut, filters) : "");
      setShared(false);
      setDuplicate(false);
      setServerError(null);
    }
    // `cut`/`filters`/`dark` are read only to build that default; they are
    // deliberately not deps, or editing a filter with the dialog open would
    // overwrite whatever the user had typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const n = activeFilterEntries({ cut, chart, filters, viewId: null }).length;
  const definitionLine = `${CUT_LABEL[cut]} · ${CHART_LABEL[chart]} · ${n} ${
    n === 1 ? "filter" : "filters"
  }`;

  function candidatePoolNames(forShared: boolean): string[] {
    return savedViews
      .filter((v) => (forShared ? v.shared : !v.shared && v.mine))
      .map((v) => v.name);
  }

  function handleNameChange(value: string) {
    setName(value);
    // Typing again is the request to retry; the duplicate mark clears
    // immediately rather than waiting for the next blur.
    setDuplicate(false);
    setServerError(null);
  }

  function handleNameBlur() {
    if (name.trim().length === 0) return;
    setDuplicate(hasDuplicateViewName(name, candidatePoolNames(shared)));
  }

  function handleSharedChange(checked: boolean) {
    setShared(checked);
    // The duplicate pool depends on which name-uniqueness scope applies —
    // re-check immediately so flipping the checkbox after a blur can't leave
    // a stale duplicate mark (or a stale ALL-CLEAR) on screen.
    if (name.trim().length > 0) {
      setDuplicate(hasDuplicateViewName(name, candidatePoolNames(checked)));
    }
  }

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !duplicate && !isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    if (hasDuplicateViewName(trimmedName, candidatePoolNames(shared))) {
      setDuplicate(true);
      return;
    }

    startTransition(async () => {
      const result = await createSavedView({
        name: trimmedName,
        cut,
        chart,
        filters,
        shared: workspaceKind === "team" ? shared : undefined,
      });

      if (!result.ok) {
        if (result.error === "duplicate_name") {
          setDuplicate(true);
        } else if (result.error === "unsupported_cut_chart") {
          // I3: the constraint that would allow this cut/chart combination
          // is committed but not yet applied to the live database — a
          // retry can't succeed, so this doesn't get "Try again." wording.
          setServerError("This kind of view can't be saved yet.");
        } else {
          setServerError("Couldn't save this view. Try again.");
        }
        return;
      }

      onOpenChange(false);
      onSaved(result.data);
      // `createSavedView` already calls `revalidatePath`, and invoking a
      // Server Action from a client component normally re-syncs the Router
      // Cache on its own once it resolves — this call is a defensive
      // fallback for the case where it doesn't (not empirically verified
      // against a live workspace in this pass; see task-9a-report.md). It
      // is harmless either way: a no-op if the view already reappeared on
      // its own, one extra RSC fetch if it didn't.
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* Radix's `virtualRef` is typed `RefObject<Measurable>` (no `| null`),
          but `anchorRef` is a real DOM ref that starts null before mount —
          the same shape every `useRef<HTMLElement>(null)` has. Radix reads
          `.current` defensively at measure time, so this is a type-only
          cast, not a behavior change. */}
      <PopoverAnchor
        virtualRef={anchorRef as unknown as React.RefObject<HTMLButtonElement>}
      />
      <PopoverContent
        align="start"
        side={side}
        sideOffset={6}
        role="dialog"
        aria-label="Save this view"
        className={cn(
          "w-[332px] rounded-[12px] p-4",
          dark
            ? "border border-white/10 bg-[rgba(13,13,13,0.9)] shadow-[var(--shadow-dropdown)] backdrop-blur-[10px]"
            : "border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)]",
        )}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onOpenChange(false);
          }
        }}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p
            className="text-[13px] font-medium"
            style={{ color: dark ? "rgba(255,255,255,1)" : "var(--ink-900)" }}
          >
            Save this view
          </p>

          <div className="flex flex-col gap-1.5">
            {/* `text-micro` sets its own colour unlayered, so the dark
                override is an inline style, not a Tailwind utility. */}
            <label
              htmlFor={nameId}
              className="text-micro"
              style={dark ? { color: "rgba(255,255,255,0.55)" } : undefined}
            >
              Name
            </label>
            <input
              id={nameId}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={handleNameBlur}
              autoFocus
              aria-invalid={duplicate || undefined}
              aria-describedby={duplicate ? errorId : undefined}
              placeholder="e.g. Break points, deuce side"
              className={cn(
                "h-8 w-full rounded-[6px] border px-2.5 text-[13px] transition-colors duration-200 outline-none",
                dark
                  ? "bg-white/[0.08] text-white placeholder:text-white/40"
                  : "bg-[var(--surface-card)] text-[var(--ink-900)] placeholder:text-[var(--ink-400)]",
                duplicate
                  ? "border-[var(--error)]"
                  : dark
                    ? "border-white/10 focus:border-[var(--blue)]"
                    : "border-[var(--border-field)] focus:border-[var(--blue)]",
              )}
            />
            {duplicate && (
              <p
                id={errorId}
                role="alert"
                className="text-[11px]"
                style={{ color: "var(--error)" }}
              >
                {dark
                  ? `You already have a view called “${trimmedName}”. Pick another name, or open that one from the menu.`
                  : "A view with this name already exists."}
              </p>
            )}
          </div>

          <div
            className="flex flex-col gap-1"
            style={{
              backgroundColor: dark
                ? "rgba(255,255,255,0.06)"
                : "var(--surface-subtle)",
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <p
              className="text-[12px]"
              style={{
                color: dark ? "rgba(255,255,255,0.78)" : "var(--ink-700)",
              }}
            >
              {definitionLine}
            </p>
            <p
              className="text-[11px]"
              style={{
                color: dark ? "rgba(255,255,255,0.45)" : "var(--ink-500)",
              }}
            >
              Depth bands are not part of a view.
            </p>
          </div>

          {workspaceKind === "team" && (
            <label className="flex cursor-pointer items-start gap-2.5">
              <span className="relative mt-[1px] inline-flex shrink-0">
                <input
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => handleSharedChange(e.target.checked)}
                  className="peer absolute h-0 w-0 opacity-0"
                  aria-label="Share with team"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-[16px] w-[16px] items-center justify-center rounded-[var(--radius-cell)] border transition-[background-color,border-color] duration-200 peer-checked:border-[var(--blue)] peer-checked:bg-[var(--blue)] peer-focus-visible:shadow-[var(--focus-ring)]",
                    dark
                      ? "border-white/[0.18] bg-white/[0.08]"
                      : "border-[var(--border-field)] bg-[var(--surface-card)]",
                  )}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(
                      "transition-opacity duration-200",
                      shared ? "opacity-100" : "opacity-0",
                    )}
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              </span>
              <span className="flex flex-col gap-0.5">
                <span
                  className="text-[13px]"
                  style={{
                    color: dark ? "rgba(255,255,255,1)" : "var(--ink-900)",
                  }}
                >
                  Share with team
                </span>
                <span
                  className="text-micro"
                  style={dark ? { color: "rgba(255,255,255,0.5)" } : undefined}
                >
                  Everyone in {workspaceName} can open it
                </span>
              </span>
            </label>
          )}

          {serverError && (
            <p
              role="alert"
              className="text-[11px]"
              style={{ color: "var(--error)" }}
            >
              {serverError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                "cursor-pointer text-[12px] font-medium",
                dark
                  ? "text-white/85 hover:text-white"
                  : "text-[var(--ink-700)] hover:text-[var(--ink-900)]",
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              aria-disabled={!canSubmit}
              aria-busy={isPending}
              className={cn(
                advButton("primary", "sm"),
                !canSubmit && "opacity-45",
              )}
              onClick={(e) => {
                if (!canSubmit) e.preventDefault();
              }}
            >
              Save view
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
