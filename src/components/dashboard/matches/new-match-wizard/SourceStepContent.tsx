"use client";

/**
 * SourceStepContent — Step 1, "Where this match lives, and what it's made from."
 *
 * Three facts before the file, as underline fields at the 40px register:
 *
 *   Workspace · which workspace the match is filed under and billed against
 *   For       · whose match it is — the uploader in a personal workspace, a
 *               roster pick in a team one
 *   Source    · what the match is made from — video for Advantage
 *               Intelligence, an export for SwingVision
 *
 * Each field is a 40px lead (workspace square, avatar circle, engine mark), a
 * 14px value with one text-micro subline, and a hairline rule that goes 2px
 * Signal Blue on the field being worked. The two fields with menus open the
 * EntitySelect grammar: 12px radius, 6px padding, one quiet sentence-case
 * section label, rows on an 8px radius with the surface-subtle wash on the
 * current pick.
 *
 * "Upload for a teammate" is not a mode switch. It moves the workspace to the
 * team — in place, so the step underneath survives — leaves the other two
 * fields alone, and opens the roster picker. Design: Upload Wizard v5, frames
 * 1a · 1b · 2a · 2b · 2c.
 *
 * ── Attribution ─────────────────────────────────────────────────────────────
 * The For field is the who-played question, and the rule it inherited stands:
 * the id travels with the CLICK, never the text. `matches.player1_id` is half
 * the SELECT policy on `matches`, so a wrong id is not a mislabelled row — it
 * hands read access to the wrong person and silently attributes every
 * statistic to them. A roster row writes that profile's `program_players.id`;
 * the uploader's own row writes their login id, exactly what the wizard wrote
 * before this control existed. See `MatchSubject` in the hook.
 */

import { memo, useCallback, useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Info,
  Loader2,
  Plus,
  User,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatePill } from "@/components/ui/state-pill";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/data/match-utils";
import { providers, type Provider } from "@/lib/providers";
import { providerKindOrNull, type ProviderId } from "@/lib/services/upload";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { setActiveWorkspaceInPlace } from "@/lib/workspace/actions";
import {
  canUploadForProgram,
  explainVideoRefusal,
  type Workspace,
} from "@/lib/workspace/types";
import type { MatchSubject, RosterOption } from "./useUploadMatchWizard";

export interface SourceStepContentProps {
  selectedProvider: ProviderId | null;
  onProviderSelect: (providerId: string | null) => void;
  /** The who-played question, from the hook. `required` only in a team workspace. */
  whoPlayed: {
    required: boolean;
    roster: RosterOption[] | null;
    uploaderName: string | null;
    subject: MatchSubject | null;
    choose: (subject: MatchSubject) => void;
  };
}

type FieldName = "workspace" | "for" | "source";

/**
 * How each source is described, in the design's words rather than the provider
 * registry's. The registry's `description` is written for a card; these are
 * the field's subline, the menu row's one-line difference, and the mono file
 * types. Anything the registry adds that is not named here falls back to its
 * own name and description.
 */
const SOURCE_COPY: Partial<
  Record<
    ProviderId,
    { label: string; subline: string; menuSubline: string; types: string }
  >
> = {
  splitstep: {
    label: "Advantage Intelligence",
    subline:
      "Match video · court tracking, shot maps, serve placement, commentary",
    menuSubline: "Match video · we compute the match · singles",
    types: "MP4 · MOV",
  },
  "swing-vision": {
    label: "SwingVision export",
    subline: "Session export · shot data already computed · singles",
    menuSubline: "Session export · stats already computed · singles",
    types: "XLSX",
  },
};

function sourceCopy(provider: Provider) {
  return (
    SOURCE_COPY[provider.id] ?? {
      label: provider.name,
      subline: provider.description ?? "",
      menuSubline: provider.description ?? "",
      types: "",
    }
  );
}

/** "Cardinal · M" — the squad initial the frames put beside a team's name. */
function workspaceLabel(workspace: Workspace): string {
  if (workspace.kind !== "team") return "You";
  const squad = workspace.team === "mens" ? "M" : workspace.team === "womens" ? "W" : null;
  return squad ? `${workspace.name} · ${squad}` : workspace.name;
}

/** The subline under a workspace, for the field and for its menu rows. */
function workspaceSubline(workspace: Workspace): string {
  return workspace.kind === "team"
    ? "Team workspace · upload for any player on the roster"
    : "Personal workspace · your matches, your hours";
}

/** "#2 Singles · Junior" — a roster row's middot-joined meta. */
function rosterMeta(player: RosterOption): string {
  return [
    player.ladderPosition !== null ? `#${player.ladderPosition} Singles` : null,
    player.classYear,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The engine mark — the logo's swoosh, white on the ink-900 square. */
function EngineMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 46 31"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M41.7009 0H45.1302C45.1302 0 40.4398 6.71648 39.7882 13.2483C38.88 22.3614 43.368 29.0393 44.7591 30.9489C43.4591 30.9652 42.7001 30.9768 41.3859 30.9489C38.0844 25.9067 36.275 17.7237 37.1852 13.314C34.9107 16.3991 30.5157 21.589 23.0555 25.6051C13.3586 30.8251 4.11874 31.0985 0 30.9816V27.7457C5.87793 28.1363 13.7728 26.4917 18.0092 24.4885C20.1161 23.4918 26.4564 20.9122 31.8086 15.501C32.7258 14.5738 34.0935 13.1912 35.513 11.0836C37.2732 8.18409 38.1692 6.497 39.7801 3.54241C40.6156 2.00904 41.2262 0.777321 41.6989 0.000966817L41.7009 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** A source's mark at either of the two sizes the step draws it. */
function SourceMark({
  provider,
  size,
}: {
  provider: Provider;
  size: 40 | 26;
}) {
  const box = size === 40 ? "size-10" : "size-[26px]";
  if (providerKindOrNull(provider.id) === "processing") {
    // The engine signature is reserved for what Advantage Intelligence
    // computes — an export it does not, so only this branch gets the square.
    return (
      <span
        aria-label={provider.name}
        className={cn(
          box,
          "inline-flex shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--ink-900)] text-white"
        )}
      >
        <EngineMark className={size === 40 ? "h-[15px] w-[22px]" : "h-[10px] w-[15px]"} />
      </span>
    );
  }
  return (
    <span
      aria-label={provider.name}
      className={cn(
        box,
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-button)]"
      )}
    >
      {/* The provider's colours live inside this square and nowhere else. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={provider.id === "swing-vision" ? "/providers/swingvision-icon.png" : provider.logo}
        alt=""
        width={size}
        height={size}
        className="size-full object-contain"
      />
    </span>
  );
}

/** A 22px avatar for a menu row — initials, or the dashed ring of a profile nobody has claimed. */
function RowAvatar({
  initials,
  dashed = false,
}: {
  initials: string;
  dashed?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
        dashed
          ? "border border-dashed border-[var(--ink-300)] text-[var(--ink-400)]"
          : "bg-[var(--surface-muted)] text-[var(--ink-700)]"
      )}
    >
      {initials}
    </span>
  );
}

/** The 18px grey capsule — "You" beside a name, "Coach-managed" on a row. */
function Pill({ children }: { children: React.ReactNode }) {
  return <StatePill>{children}</StatePill>;
}

/**
 * One underline field: eyebrow, then the 40px row on a hairline that turns 2px
 * Signal Blue while the field is the one being worked. The rule is an inset
 * shadow rather than a border so the 1px→2px change moves nothing.
 */
function Field({
  label,
  active,
  children,
  below,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
  /** A note strip under the row — the SwingVision trade, a refusal. */
  below?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[14px]">
      <span className="eyebrow">{label}</span>
      <div
        className={cn(
          "flex items-center gap-4 pb-4 transition-shadow duration-200 ease-[var(--ease-primary)]",
          active
            ? "shadow-[inset_0_-2px_0_var(--blue)]"
            : "shadow-[inset_0_-1px_0_var(--border-hairline)]"
        )}
      >
        {children}
      </div>
      {below}
    </div>
  );
}

/** The value + subline column every row carries. */
function FieldText({
  value,
  subline,
  muted = false,
}: {
  value: React.ReactNode;
  subline: string;
  muted?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span
        className={cn(
          "inline-flex items-center gap-2 text-[14px] leading-5",
          muted ? "text-[var(--ink-500)]" : "text-[var(--ink-900)]"
        )}
      >
        {value}
      </span>
      <span className="text-micro truncate leading-4">{subline}</span>
    </span>
  );
}

/** The row itself as a control — the whole underline is the trigger. */
const ROW_TRIGGER_CLS =
  "flex w-full min-w-0 flex-1 cursor-pointer items-center gap-4 text-left focus-visible:outline-none focus-visible:[&>span:first-child]:shadow-[var(--focus-ring)]";

/** The float menu — EntitySelect grammar, spanning the field it belongs to. */
const MENU_CLS =
  "w-[var(--radix-popover-trigger-width)] rounded-[var(--radius-dropdown)] border-[var(--border-hairline)] bg-white p-1.5 shadow-[var(--shadow-dropdown)] flex flex-col";

const MENU_LABEL_CLS = "px-2.5 pb-1 pt-2 text-[11px] text-[var(--ink-400)]";

const NOTE_CLS =
  "flex items-start gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[11px] leading-[1.6] text-[var(--ink-700)]";

function SourceStepContentImpl({
  selectedProvider,
  onProviderSelect,
  whoPlayed,
}: SourceStepContentProps) {
  const { active, available, viewer } = useWorkspace();
  const isTeam = active.kind === "team";

  // Which field carries the blue rule. Personal rests on Workspace, team on
  // For — the field that is live there — and any field being worked takes it
  // until the workspace changes underneath.
  const [worked, setWorked] = useState<FieldName | null>(null);
  const [openMenu, setOpenMenu] = useState<FieldName | null>(null);

  // A workspace switch that must land with a menu open: "Upload for a
  // teammate" switches in place, and once the team arrives the roster picker
  // opens on it.
  const [openForOnTeam, setOpenForOnTeam] = useState(false);
  const [, startTransition] = useTransition();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  // Adjusting state during render rather than in an effect: the workspace
  // arriving is the event, and React re-runs this render immediately with the
  // new values instead of painting a stale rule first.
  const [seenTeam, setSeenTeam] = useState(isTeam);
  if (seenTeam !== isTeam) {
    setSeenTeam(isTeam);
    if (isTeam && openForOnTeam) {
      setOpenForOnTeam(false);
      setWorked("for");
      setOpenMenu("for");
    } else {
      setWorked(null);
    }
  }
  const activeField: FieldName = worked ?? (isTeam ? "for" : "workspace");
  const setActiveField = setWorked;

  const switchWorkspace = useCallback(
    (workspace: Workspace, thenOpenFor: boolean) => {
      if (workspace.id === active.id) return;
      setOpenForOnTeam(thenOpenFor && workspace.kind === "team");
      setSwitchingTo(workspace.id);
      startTransition(async () => {
        try {
          const switched = await setActiveWorkspaceInPlace(workspace.id);
          if (!switched) setOpenForOnTeam(false);
        } finally {
          setSwitchingTo(null);
        }
      });
    },
    [active.id]
  );

  const menuFor = (field: FieldName) => ({
    open: openMenu === field,
    onOpenChange: (open: boolean) => {
      setOpenMenu(open ? field : null);
      if (open) setActiveField(field);
    },
  });

  // ── Workspace ────────────────────────────────────────────────────────────
  const switchable = available.length > 1;
  const teamWorkspaces = available.filter(
    (workspace) => workspace.kind === "team" && canUploadForProgram(workspace)
  );

  const workspaceRow = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-button)] text-[13px] font-medium text-white",
          isTeam ? "bg-[var(--ink-900)]" : "bg-[var(--blue)]"
        )}
      >
        {active.mark}
      </span>
      <FieldText value={workspaceLabel(active)} subline={workspaceSubline(active)} />
      {switchable && (
        <ChevronsUpDown
          className="size-[13px] shrink-0 text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
    </>
  );

  // ── For ──────────────────────────────────────────────────────────────────
  const subject = whoPlayed.subject;
  const chosenRoster =
    subject?.kind === "roster"
      ? whoPlayed.roster?.find((row) => row.playerId === subject.playerId) ?? null
      : null;
  const uploaderInitials = viewer.initials;
  const uploaderName = whoPlayed.uploaderName ?? viewer.name;

  const forLead = (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-medium",
        isTeam && !subject
          ? "bg-[var(--surface-subtle)]"
          : "bg-[var(--surface-muted)] text-[var(--ink-700)]"
      )}
    >
      {isTeam && !subject ? (
        <User className="size-4 text-[var(--ink-400)]" strokeWidth={1.5} />
      ) : subject?.kind === "roster" ? (
        getInitials(subject.name)
      ) : (
        uploaderInitials
      )}
    </span>
  );

  const forText = !isTeam ? (
    <FieldText
      value={
        <>
          {uploaderName} <Pill>You</Pill>
        </>
      }
      subline={`Personal workspace · ${viewer.email}`}
    />
  ) : !subject ? (
    <FieldText
      muted
      value="Choose a player"
      subline="They get the report in their own workspace · you're credited as the uploader"
    />
  ) : subject.kind === "roster" ? (
    <FieldText
      value={subject.name}
      subline={[
        chosenRoster ? rosterMeta(chosenRoster) : null,
        "gets the report, you're credited",
      ]
        .filter(Boolean)
        .join(" · ")}
    />
  ) : (
    <FieldText
      value={
        <>
          {uploaderName} <Pill>You</Pill>
        </>
      }
      subline={`Your own match · filed under ${workspaceLabel(active)}`}
    />
  );

  // ── Source ───────────────────────────────────────────────────────────────
  // Two options only: a coming-soon provider has nothing to choose yet, and
  // the row that says so belongs on a help page, not in a two-item menu.
  const sources = providers.filter((provider) => provider.available !== false);
  const current = sources.find((provider) => provider.id === selectedProvider) ?? null;
  const currentKind = current ? providerKindOrNull(current.id) : null;
  const videoRefusal = currentKind === "processing" ? explainVideoRefusal(active) : null;
  const teamHours = isTeam && currentKind === "processing" ? " · team hours" : "";

  const sourceNote =
    currentKind === "import" ? (
      <div className={NOTE_CLS}>
        <Info
          className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span>
          The numbers come from the app, so nothing is processed here — no
          clips, no video review, and no hours spent. Singles only for now.{" "}
          <Link
            href="/dashboard/help#swingvision"
            className="font-medium text-[var(--blue-text)] transition-colors duration-150 hover:text-[var(--ink-900)]"
          >
            What an export includes
          </Link>
        </span>
      </div>
    ) : videoRefusal ? (
      // Advisory, never a gate: `reserveQuota()` is the choke point every
      // submission passes and the only thing that refuses. This says WHY, in
      // the same sentence the spend would use.
      <div className={NOTE_CLS}>
        <Info
          className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span>{videoRefusal}</span>
      </div>
    ) : undefined;

  return (
    <div className="flex flex-col gap-9">
      {/* Workspace */}
      <Field label="Workspace" active={activeField === "workspace"}>
        {switchable ? (
          <Popover {...menuFor("workspace")}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Workspace: ${workspaceLabel(active)}. Switch workspace`}
                className={ROW_TRIGGER_CLS}
              >
                {workspaceRow}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} className={MENU_CLS}>
              <span className={MENU_LABEL_CLS}>Where this match is filed</span>
              {available.map((workspace) => {
                const isActive = workspace.id === active.id;
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    disabled={switchingTo !== null}
                    onClick={() => {
                      setOpenMenu(null);
                      switchWorkspace(workspace, false);
                    }}
                    className={cn(
                      "flex h-[38px] w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
                      isActive
                        ? "bg-[var(--surface-subtle)]"
                        : "hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)]"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-flex size-[22px] shrink-0 items-center justify-center rounded-[var(--radius-button)] text-[10px] font-medium text-white",
                        workspace.kind === "team"
                          ? "bg-[var(--ink-900)]"
                          : "bg-[var(--blue)]"
                      )}
                    >
                      {workspace.mark}
                    </span>
                    <span className="text-[12px] font-medium text-[var(--ink-900)]">
                      {workspaceLabel(workspace)}
                    </span>
                    <span className="min-w-0 truncate text-[11px] text-[var(--ink-500)]">
                      {workspaceSubline(workspace)}
                    </span>
                    <span className="flex-1" />
                    {switchingTo === workspace.id ? (
                      <Loader2
                        className="size-[13px] shrink-0 animate-spin text-[var(--ink-400)]"
                        aria-hidden="true"
                      />
                    ) : isActive ? (
                      <Check
                        className="size-[13px] shrink-0 text-[var(--ink-900)]"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="w-[13px] shrink-0" />
                    )}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        ) : (
          workspaceRow
        )}
      </Field>

      {/* For */}
      <Field label="For" active={activeField === "for"}>
        {!isTeam ? (
          <>
            {forLead}
            {forText}
            {teamWorkspaces.length > 0 && (
              <button
                type="button"
                disabled={switchingTo !== null}
                onClick={() => {
                  // One team: go there and open the roster. Several: the
                  // Workspace menu is where the choice between them lives.
                  if (teamWorkspaces.length === 1) {
                    switchWorkspace(teamWorkspaces[0], true);
                  } else {
                    setActiveField("workspace");
                    setOpenMenu("workspace");
                  }
                }}
                className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--blue-text)] transition-colors duration-150 hover:text-[var(--ink-900)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {switchingTo ? "Switching…" : "Upload for a teammate"}
              </button>
            )}
            <span className="w-[13px] shrink-0" aria-hidden="true" />
          </>
        ) : (
          <Popover {...menuFor("for")}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={
                  subject
                    ? `For: ${subject.kind === "roster" ? subject.name : uploaderName}. Choose a player`
                    : "Choose a player"
                }
                className={ROW_TRIGGER_CLS}
              >
                {forLead}
                {forText}
                <ChevronDown
                  className={cn(
                    "size-[13px] shrink-0 text-[var(--ink-400)] transition-transform duration-200 ease-[var(--ease-primary)]",
                    openMenu === "for" && "rotate-180"
                  )}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className={MENU_CLS}
              role="listbox"
              aria-label="Who played this match"
            >
              {/* Someone new — first, above the hairline. The invite itself
                  lives on the roster page; the match waits for them there. */}
              <Link
                href="/dashboard/team/roster"
                className="flex h-[38px] items-center gap-2.5 rounded-[var(--radius-element)] px-2.5 transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--ink-300)]"
                >
                  <Plus className="size-[11px] text-[var(--ink-500)]" strokeWidth={1.5} />
                </span>
                <span className="text-[12px] font-medium text-[var(--ink-900)]">
                  Someone new
                </span>
                <span className="min-w-0 truncate text-[11px] text-[var(--ink-500)]">
                  Invite by email · they claim the match when they join
                </span>
              </Link>
              <span className="my-[5px] h-px bg-[var(--border-hairline)]" />
              <span className="px-2.5 pb-1 pt-1.5 text-[11px] text-[var(--ink-400)]">
                Roster · {workspaceLabel(active)}
              </span>

              {/* The uploader's own row. "self" writes their login id — the
                  wizard's original answer, unchanged. */}
              {uploaderName && (
                <RosterRow
                  chosen={subject?.kind === "self"}
                  onChoose={() => {
                    whoPlayed.choose({ kind: "self" });
                    setOpenMenu(null);
                  }}
                  avatar={<RowAvatar initials={uploaderInitials} />}
                  name={uploaderName}
                  meta="Your own match"
                  trailing={<Pill>You</Pill>}
                />
              )}

              {whoPlayed.roster === null ? (
                <span className="px-2.5 py-2 text-[11px] text-[var(--ink-500)]">
                  Loading the roster…
                </span>
              ) : whoPlayed.roster.length === 0 ? (
                <span className="px-2.5 py-2 text-[11px] text-[var(--ink-500)]">
                  Nobody else is on this program&rsquo;s roster yet.
                </span>
              ) : (
                whoPlayed.roster.map((player) => {
                  const chosen =
                    subject?.kind === "roster" && subject.playerId === player.playerId;
                  const invited = player.invitedEmail !== null && player.userId === null;
                  return (
                    <RosterRow
                      key={player.playerId}
                      chosen={chosen}
                      onChoose={() => {
                        whoPlayed.choose({
                          kind: "roster",
                          playerId: player.playerId,
                          name: player.name,
                        });
                        setOpenMenu(null);
                      }}
                      avatar={
                        <RowAvatar initials={getInitials(player.name)} dashed={invited} />
                      }
                      name={player.name}
                      meta={
                        invited
                          ? `Invited · ${player.invitedEmail}`
                          : rosterMeta(player)
                      }
                      trailing={
                        // Roster state travels with the person: a profile a
                        // coach still runs carries the grey pill.
                        !invited && player.managedBy === "coach" && player.userId === null ? (
                          <Pill>Coach-managed</Pill>
                        ) : null
                      }
                    />
                  );
                })
              )}
            </PopoverContent>
          </Popover>
        )}
      </Field>

      {/* Source */}
      <Field label="Source" active={activeField === "source"} below={sourceNote}>
        <Popover {...menuFor("source")}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={
                current ? `Source: ${sourceCopy(current).label}. Change source` : "Choose a source"
              }
              className={ROW_TRIGGER_CLS}
            >
              {current ? (
                <SourceMark provider={current} size={40} />
              ) : (
                <span
                  aria-hidden="true"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)]"
                />
              )}
              {current ? (
                <FieldText
                  value={sourceCopy(current).label}
                  subline={sourceCopy(current).subline}
                />
              ) : (
                <FieldText
                  muted
                  value="Choose a source"
                  subline="What this match is made from"
                />
              )}
              {current && sourceCopy(current).types && (
                <span className="mono tabular whitespace-nowrap text-[11px] text-[var(--ink-500)]">
                  {sourceCopy(current).types}
                  {teamHours}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "size-[13px] shrink-0 text-[var(--ink-400)] transition-transform duration-200 ease-[var(--ease-primary)]",
                  openMenu === "source" && "rotate-180"
                )}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            className={cn(MENU_CLS, "gap-0.5")}
            role="listbox"
            aria-label="What this match is made from"
          >
            <span className={MENU_LABEL_CLS}>What this match is made from</span>
            {sources.map((provider) => {
              const isCurrent = provider.id === selectedProvider;
              const copy = sourceCopy(provider);
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => {
                    if (!isCurrent) onProviderSelect(provider.id);
                    setOpenMenu(null);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-element)] px-2.5 py-[9px] text-left transition-colors duration-150 focus-visible:outline-none",
                    isCurrent
                      ? "bg-[var(--surface-subtle)]"
                      : "hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)]"
                  )}
                >
                  <SourceMark provider={provider} size={26} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[13px] font-medium text-[var(--ink-900)]">
                      {copy.label}
                    </span>
                    <span className="truncate text-[11px] text-[var(--ink-500)]">
                      {copy.menuSubline}
                    </span>
                  </span>
                  {copy.types && (
                    <span className="mono tabular whitespace-nowrap text-[11px] text-[var(--ink-500)]">
                      {copy.types}
                    </span>
                  )}
                  {isCurrent ? (
                    <Check
                      className="size-[13px] shrink-0 text-[var(--ink-900)]"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="w-[13px] shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </Field>
    </div>
  );
}

/** One 38px row of the roster picker. */
function RosterRow({
  chosen,
  onChoose,
  avatar,
  name,
  meta,
  trailing,
}: {
  chosen: boolean;
  onChoose: () => void;
  avatar: React.ReactNode;
  name: string;
  meta: string;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={chosen}
      onClick={onChoose}
      className={cn(
        "flex h-[38px] w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5 text-left transition-colors duration-150 focus-visible:outline-none",
        chosen
          ? "bg-[var(--surface-subtle)]"
          : "hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)]"
      )}
    >
      {avatar}
      <span className="whitespace-nowrap text-[12px] font-medium text-[var(--ink-900)]">
        {name}
      </span>
      {meta && (
        <span className="min-w-0 truncate text-[11px] text-[var(--ink-500)]">{meta}</span>
      )}
      {trailing && (
        <>
          <span className="flex-1" />
          {trailing}
        </>
      )}
    </button>
  );
}

export const SourceStepContent = memo(SourceStepContentImpl);
