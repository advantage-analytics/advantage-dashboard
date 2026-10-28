"use client";

/**
 * Step 1 in the admin console: the Workspace field that can pick ANY team or
 * any player's personal workspace (board UploadFor, "Any account · admin"),
 * and — for a player — how the upload is billed.
 *
 * Neither control changes the wizard in place. Each navigates to the console
 * URL for the new target and the same kind (`AdminWizardMode.uploadKind`),
 * and the page
 * resolves it from scratch: a new roster or player, a new allowance, and new
 * operation ids, so an operation is never reused for another target or
 * billing. They only ever render on step 1, before anything is written.
 *
 * Passed to `SourceStepContent` as elements, not imported by it: that
 * module's imports are pinned by `tests/upload-source.spec.ts`.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2, Search, User } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChosenCheck } from "@/components/ui/float-menu";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { WorkspaceMark } from "@/components/dashboard/workspace-mark";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/data/match-utils";
import { formatHoursShort, isUnlimitedCap } from "@/lib/data/usage-format";
import { searchAdminUploadTargetsAction } from "@/app/admin/uploads/new/target-actions";
import type { AdminUploadTargetHit } from "@/lib/admin/uploads/targets";
import type { AdminUploadBilling } from "@/lib/admin/uploads/types";
import type { AdminWizardMode } from "./admin-mode";
import {
  adminUploadHref,
  type AdminPlayerTarget,
} from "@/components/admin/admin-upload-selection";
import { FieldCaption } from "./FieldCaption";
import { workspaceLabel } from "./RosterMenu";
import { focusRingCls } from "./styles";

/** The console URL for another target, or null when the mode has no kind. */
function retargetHref(
  mode: AdminWizardMode,
  target: string | AdminPlayerTarget,
): string | null {
  return mode.uploadKind ? adminUploadHref(target, mode.uploadKind) : null;
}

const MENU_CLS =
  "w-[var(--radix-popover-trigger-width)] rounded-[var(--radius-dropdown)] border-[var(--border-hairline)] bg-white p-1.5 shadow-[var(--shadow-dropdown)] flex flex-col";
const MENU_LABEL_CLS = "px-2.5 pb-1 pt-2 text-[11px] text-[var(--ink-400)]";
const ROW_CLS =
  "flex h-[38px] w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5 text-left transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none";

/** "2 h left this month", or what free means when nothing is counted. */
function allowanceLine(seconds: number) {
  return isUnlimitedCap(seconds)
    ? "No hours counted"
    : `${formatHoursShort(seconds)} h left this month`;
}

/** The Workspace row's subline for the console's target. */
export function adminWorkspaceSubline(mode: AdminWizardMode): string {
  const { context } = mode;
  if (!context.owner)
    return `Team workspace · ${allowanceLine(context.videoAllowance.remainingSeconds)}`;
  return [
    "Personal workspace",
    context.owner.billing === "free" ? "Free" : "Player’s allowance",
    allowanceLine(context.videoAllowance.remainingSeconds),
  ].join(" · ");
}

/**
 * The Workspace field's row in the console: the target's mark and name, and
 * a search over every team and player. Rendered inside `SourceStepContent`'s
 * own `Field`, so the underline and caption stay that component's.
 */
export function AdminWorkspaceRow({ mode }: { mode: AdminWizardMode }) {
  const router = useRouter();
  const { context } = mode;
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<AdminUploadTargetHit[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  const [leaving, setLeaving] = useState<string | null>(null);
  const request = useRef(0);

  // A short debounce: the search is two service-role reads per keystroke.
  useEffect(() => {
    const query = term.trim();
    if (!query) return;
    const token = ++request.current;
    const timer = window.setTimeout(() => {
      setState("loading");
      searchAdminUploadTargetsAction(query)
        .then((rows) => {
          if (request.current !== token) return;
          setHits(rows);
          setState("idle");
        })
        .catch(() => {
          if (request.current === token) setState("failed");
        });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [term]);

  const label = context.owner
    ? context.owner.viewer.name
    : workspaceLabel(context.workspace);
  const chosen = (hit: AdminUploadTargetHit) =>
    hit.kind === "player"
      ? context.owner?.viewer.id === hit.id
      : !context.owner && context.workspace.id === hit.id;
  const choose = (hit: AdminUploadTargetHit) => {
    const href = retargetHref(
      mode,
      hit.kind === "team" ? hit.id : { player: hit.id },
    );
    if (chosen(hit) || !href) {
      setOpen(false);
      return;
    }
    setLeaving(hit.id);
    router.push(href);
  };
  const shown = term.trim() ? hits : [];
  const players = shown.filter((hit) => hit.kind === "player");
  const teams = shown.filter((hit) => hit.kind === "team");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Workspace: ${label}. Choose any team or player`}
          className="flex w-full min-w-0 flex-1 cursor-pointer items-center gap-4 text-left focus-visible:outline-none focus-visible:[&>span:first-child]:shadow-[var(--focus-ring)]"
        >
          {context.owner ? (
            <PersonAvatar
              initials={context.owner.viewer.initials}
              photoUrl={context.owner.viewer.avatarUrl}
              className="size-10 text-[13px]"
            />
          ) : (
            <WorkspaceMark
              workspace={context.workspace}
              className="size-10 rounded-[var(--radius-button)] text-[13px]"
            />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[14px] leading-5 text-[var(--ink-900)]">
              {label}
            </span>
            <span className="text-micro truncate leading-4">
              {adminWorkspaceSubline(mode)}
            </span>
          </span>
          <ChevronsUpDown
            className="size-[13px] shrink-0 text-[var(--ink-400)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className={MENU_CLS}>
        <label className="flex h-[38px] items-center gap-2 px-2.5">
          <Search
            className="size-[13px] shrink-0 text-[var(--ink-400)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <input
            type="search"
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search players and teams"
            aria-label="Search players and teams"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
          />
          {state === "loading" && (
            <Loader2
              className="size-[13px] shrink-0 animate-spin text-[var(--ink-400)]"
              aria-hidden="true"
            />
          )}
        </label>
        <span className="my-[5px] h-px bg-[var(--border-hairline)]" />
        {state === "failed" ? (
          <p
            role="alert"
            className="px-2.5 py-2 text-[12px] text-[var(--error)]"
          >
            We couldn’t search. Try again.
          </p>
        ) : !term.trim() ? (
          <p className="px-2.5 py-2 text-[12px] text-[var(--ink-500)]">
            Any player’s personal workspace, or any team.
          </p>
        ) : state === "idle" && shown.length === 0 ? (
          <p
            role="status"
            className="px-2.5 py-2 text-[12px] text-[var(--ink-500)]"
          >
            No players or teams match.
          </p>
        ) : null}
        {[
          { title: "Players · personal workspace", rows: players },
          { title: "Teams", rows: teams },
        ].map(
          (group) =>
            group.rows.length > 0 && (
              <div key={group.title} className="flex flex-col">
                <span className={MENU_LABEL_CLS}>{group.title}</span>
                {group.rows.map((hit) => (
                  <button
                    key={`${hit.kind}:${hit.id}`}
                    type="button"
                    disabled={leaving !== null}
                    onClick={() => choose(hit)}
                    className={cn(ROW_CLS, "disabled:cursor-not-allowed")}
                  >
                    {hit.kind === "player" ? (
                      <PersonAvatar
                        initials={getInitials(hit.title) || "?"}
                        photoUrl={hit.markUrl}
                        className="size-[22px] text-[10px]"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[10px] font-medium"
                      >
                        {hit.title.trim().charAt(0).toUpperCase() || (
                          <User className="size-3" strokeWidth={1.5} />
                        )}
                      </span>
                    )}
                    <span className="text-[12px] font-medium whitespace-nowrap text-[var(--ink-900)]">
                      {hit.title}
                    </span>
                    {hit.subtitle && (
                      <span className="min-w-0 truncate text-[11px] text-[var(--ink-500)]">
                        {hit.subtitle}
                      </span>
                    )}
                    <span className="flex-1" />
                    {leaving === hit.id ? (
                      <Loader2
                        className="size-[13px] shrink-0 animate-spin text-[var(--ink-400)]"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChosenCheck chosen={chosen(hit)} />
                    )}
                  </button>
                ))}
              </div>
            ),
        )}
      </PopoverContent>
    </Popover>
  );
}

const BILLING_OPTIONS: {
  value: AdminUploadBilling;
  label: string;
}[] = [
  { value: "free", label: "Free" },
  { value: "player", label: "Player’s allowance" },
];

/**
 * How a player upload is billed — the owner's decision: free on the
 * administrator's behalf, or the player's own free hours then credits. The
 * same radio cards the trim step's camera questions use.
 */
export function AdminBillingField({ mode }: { mode: AdminWizardMode }) {
  const router = useRouter();
  const owner = mode.context.owner;
  const [leaving, setLeaving] = useState<AdminUploadBilling | null>(null);
  if (!owner) return null;
  const firstName = owner.viewer.firstName ?? owner.viewer.name;
  const playerLeft = owner.playerAllowance.remainingSeconds;
  const hint =
    owner.billing === "free"
      ? `Billed to nobody, like your own uploads. ${firstName}’s hours are untouched.`
      : `${firstName}’s free hours first, then credits they bought · ${allowanceLine(playerLeft)}${owner.playerAllowance.creditSeconds > 0 ? ` (${formatHoursShort(owner.playerAllowance.creditSeconds)} h in credits)` : ""}`;
  return (
    <div className="flex flex-col gap-2.5">
      <FieldCaption label="Billing" />
      <div
        role="radiogroup"
        aria-label="Billing"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {BILLING_OPTIONS.map((option) => {
          const selected = owner.billing === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={leaving !== null}
              onClick={() => {
                const href = retargetHref(mode, {
                  player: owner.viewer.id,
                  billing: option.value,
                });
                if (selected || !href) return;
                setLeaving(option.value);
                router.push(href);
              }}
              className={cn(
                "flex h-10 cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] border px-3 text-[12px] font-medium whitespace-nowrap text-[var(--ink-900)] transition-colors duration-150 disabled:cursor-not-allowed",
                selected
                  ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                  : "border-[var(--border-field)] hover:bg-[var(--surface-subtle)]",
                focusRingCls,
              )}
            >
              {leaving === option.value ? (
                <Loader2
                  className="size-3.5 shrink-0 animate-spin text-[var(--ink-400)]"
                  aria-hidden="true"
                />
              ) : selected ? (
                <span className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--blue)]">
                  <Check
                    className="size-[9px] text-white"
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                </span>
              ) : (
                <span className="inline-flex size-3.5 shrink-0 rounded-full border border-[var(--ink-300)]" />
              )}
              {option.label}
            </button>
          );
        })}
      </div>
      <span className="text-micro">{hint}</span>
    </div>
  );
}
