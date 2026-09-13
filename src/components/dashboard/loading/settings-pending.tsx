"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useParams } from "next/navigation";
import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { capitalize, cn } from "@/lib/utils";
import { teamLabel, uploadPolicyLabel } from "@/lib/workspace/types";

/**
 * Settings skeletons — one per page, each a tracing of the loaded layout.
 *
 * The settings layout already paints the eyebrow, title, subtitle and rail,
 * so these cover only the column. Carbon's rule is "show what you already
 * know", and three kinds of knowing apply:
 *
 * - **Chrome.** Every card is the real `SettingsCard` frame, its real static
 *   title in ink. Everything else is a bar.
 * - **Shape.** The workspace context sits above the settings layout, so the
 *   skeleton knows — before any fetch — whether this is a team workspace, how
 *   many programs the viewer belongs to, and their role on the program being
 *   opened. Those decide how many facts the Plan strip holds, whether the team
 *   digest row exists, how many usage cards follow, which cards a program's
 *   page carries. A generic shape made the page jump on arrival.
 * - **Measure.** A bar is never a box with a guessed width and height. `Text`
 *   sets the copy the loaded page will show — the real string where it is
 *   static or already in the workspace, a same-length sample where a request
 *   supplies it — in transparent ink at the real size and leading, and paints
 *   a band on each line box it wraps to. So every row is as tall as its text
 *   and every paragraph wraps where the real one does, at 1440 and at 375
 *   alike. Controls are measured the same way, from their own labels.
 *
 * Counts no request has answered — members, usage lines, seats — use a
 * typical number. Nothing here is focusable, selectable or announced beyond
 * the one `role="status"` label.
 */

/* ---------------------------------------------------------------- atoms */

const SKELETON_BG = "bg-[var(--surface-skeleton)]";

/**
 * A band per rendered line. `box-decoration-break: clone` repeats the
 * background on every line fragment, and the gradient is sized to a 0.7em
 * stripe centred on the line — the visible bar — inside the transparent text.
 */
const BAND =
  "text-transparent select-none [-webkit-box-decoration-break:clone] [box-decoration-break:clone] bg-[linear-gradient(var(--surface-skeleton),var(--surface-skeleton))] bg-[length:100%_0.7em] bg-[position:0_55%] bg-no-repeat";

/** Copy in skeleton form: `className` carries the real type size and leading. */
function Text({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className={BAND}>{children}</span>
    </div>
  );
}

/** A box whose size is the thing itself: avatar, crest, meter, toggle. */
function Box({ className }: { className?: string }) {
  return <div className={cn("shrink-0", SKELETON_BG, className)} />;
}

/** `SettingsButton`, sized by its own label. */
function Button({
  children,
  size = "sm",
  className,
}: {
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-[6px] border border-transparent font-medium text-transparent select-none",
        size === "sm" ? "h-8 px-3 text-[12px]" : "h-9 px-4 text-[13px]",
        SKELETON_BG,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** `MenuSelect`'s pill trigger, sized by its current label and chevron. */
function PillSelect({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex h-[30px] shrink-0 items-center gap-2 rounded-[6px] border border-transparent px-3 text-[12px] text-transparent select-none",
        SKELETON_BG,
      )}
    >
      {children}
      <ChevronDown className="size-3 opacity-0" aria-hidden="true" />
    </div>
  );
}

/** `StatePill` / `YouPill` geometry. */
function Pill({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center rounded-full px-[7px] text-[10px] font-medium whitespace-nowrap text-transparent select-none",
        SKELETON_BG,
      )}
    >
      {children}
    </span>
  );
}

const Toggle = () => <Box className="h-5 w-9 rounded-full" />;

/** Real card title, as `SettingsCardTitle` sets it. */
function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-[13px] font-medium text-[var(--ink-900)]">
      {children}
    </div>
  );
}

function Column({
  label,
  width = 640,
  children,
}: {
  label: string;
  width?: 640 | 660;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "flex w-full flex-col",
        width === 660 ? "max-w-[660px]" : "max-w-[640px]",
      )}
    >
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="flex flex-col gap-5 motion-safe:animate-pulse"
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ molecules */

/** `SettingsField` over an underline control: caption, rule, optional hint. */
function Field({
  label,
  value,
  height = 34,
  hint,
}: {
  label: string;
  value: string;
  height?: 32 | 34;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Text className="text-[11px]">{label}</Text>
      <div
        className="flex items-center border-b border-[var(--border-field)]"
        style={{ height }}
      >
        <Text className="truncate text-[13px]">{value}</Text>
      </div>
      {hint && <Text className="text-[11px]">{hint}</Text>}
    </div>
  );
}

/** `SettingsCardRow`: label, optional description, a control on the right. */
function CardRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center gap-6 border-t border-[var(--border-hairline)] py-3">
      <div className="min-w-0 flex-1">
        <Text className="text-[12px]">{label}</Text>
        {description && (
          <Text className="mt-0.5 text-[11px] leading-[1.5]">
            {description}
          </Text>
        )}
      </div>
      {control}
    </div>
  );
}

/* --------------------------------------------------------------- samples */

/*
 * Stand-ins for values a request supplies. Only their length matters — they
 * are never visible — so each is a typical length for the field it fills.
 */
const SAMPLE = {
  personName: "Firstname Lastname",
  shortName: "Firstname Last",
  date: "Apr 02, 2001",
  phone: "+1 555 000 0000",
  country: "United States",
  region: "California",
  hand: "Right-handed",
  backhand: "Two-handed",
  venue: "Home Tennis Center",
  conference: "Conference",
  season: "2026–27",
  hours: "10h 00m",
  clock: "0:00 / 5:00",
  month: "Sep 2026",
} as const;

/* ---------------------------------------------------------------- pages */

/** Profile: identity card, General information, Tennis profile. */
export function SettingsProfilePending() {
  const { viewer } = useWorkspace();

  return (
    <Column label="Loading profile" width={660}>
      <SettingsCard className="flex-row items-start gap-6 py-7">
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <Box className="size-20 rounded-full" />
          <div className="min-w-0 flex-1">
            <Text className="text-title-lg truncate">{viewer.name}</Text>
            {viewer.memberSince && (
              <Text className="mono mt-1 text-[11px]">
                since {viewer.memberSince}
              </Text>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {viewer.avatarUrl ? (
                <>
                  <Text className="text-[11px] font-medium">Replace photo</Text>
                  <Text className="text-[11px] font-medium">Adjust</Text>
                  <Text className="text-[11px] font-medium">Remove</Text>
                </>
              ) : (
                <Text className="text-[11px] font-medium">Upload a photo</Text>
              )}
              <Text className="text-[11px]">
                PNG, JPG or WebP · cropped to a circle
              </Text>
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard className="gap-[18px]">
        <SettingsCardTitle
          trailing={
            <Text className="text-[11px]">
              Only your name is visible to teammates
            </Text>
          }
        >
          General information
        </SettingsCardTitle>
        <div className="grid grid-cols-1 gap-5 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-2 sm:gap-x-6">
          <Field label="First name" value={SAMPLE.personName.split(" ")[0]} />
          <Field label="Last name" value={SAMPLE.personName.split(" ")[1]} />
          <Field label="Date of birth" value={SAMPLE.date} />
          <Field
            label="Phone number"
            value={SAMPLE.phone}
            hint="Used only for account recovery."
          />
        </div>
      </SettingsCard>

      <SettingsCard className="gap-[18px]">
        <SettingsCardTitle>Tennis profile</SettingsCardTitle>
        <div className="grid grid-cols-1 gap-5 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-2 sm:gap-x-6">
          <Field label="Country" value={SAMPLE.country} />
          <Field label="State / region" value={SAMPLE.region} />
          <Field label="Playing hand" value={SAMPLE.hand} />
          <Field label="Backhand" value={SAMPLE.backhand} />
        </div>
      </SettingsCard>
    </Column>
  );
}

/** Account: Sign-in facts, the two session rows, the delete card. */
export function SettingsAccountPending() {
  const { available, viewer } = useWorkspace();
  const owned = available.filter(
    (workspace) => workspace.kind === "team" && workspace.role === "owner",
  );

  return (
    <Column label="Loading account" width={660}>
      <SettingsCard>
        <SettingsCardTitle className="pb-2">Sign-in</SettingsCardTitle>
        <FactRow label="Account email">
          <Text className="truncate text-[13px]">{viewer.email}</Text>
          <Text className="ml-auto shrink-0 text-[11px] font-medium">
            Contact support
          </Text>
        </FactRow>
        <FactRow label="Method">
          <Text className="text-[13px]">Email &amp; password</Text>
          <Text className="ml-auto shrink-0 text-[11px]">
            Magic link also enabled
          </Text>
        </FactRow>
        <FactRow label="Password">
          <div className="flex flex-col gap-0.5">
            <Text className="text-[13px]">Reset by email</Text>
            <Text className="text-[11px]">
              We email a one-time link; it expires in an hour.
            </Text>
          </div>
          <Button className="ml-auto">Reset password</Button>
        </FactRow>
      </SettingsCard>

      <SettingsCard>
        <SettingsCardTitle className="pb-2">
          Where you&apos;re signed in
        </SettingsCardTitle>
        <SessionRow
          title="This device"
          detail="Ends this session only. Other devices stay signed in."
          action="Sign out"
        />
        <SessionRow
          title="Every device"
          detail="Signing out everywhere ends every other session too — phones included."
          action="Sign out everywhere"
        />
      </SettingsCard>

      <SettingsCard className="gap-3 overflow-hidden">
        <span className="text-[13px] font-medium text-[var(--danger)]">
          Delete account
        </span>
        <Text className="text-[12px] leading-[1.55]">
          Removes your personal matches, statistics, reports, and your account
          record. Matches you filed under a team stay with that team, as a
          profile its coaches manage. This cannot be undone.
        </Text>

        {owned.length > 0 && (
          <div className="flex items-start gap-3 rounded-[8px] bg-[var(--surface-muted)] px-3.5 py-3">
            <Box className="mt-0.5 size-[13px] rounded-[3px]" />
            <div>
              <Text className="text-[12px]">
                You own {owned.map((workspace) => workspace.name).join(", ")}
              </Text>
              <Text className="mt-0.5 text-[11px] leading-[1.5]">
                Deletion is blocked until you transfer ownership. Team settings
              </Text>
            </div>
          </div>
        )}

        <div className="-mx-6 mt-1 -mb-[18px] flex flex-wrap items-center gap-3 rounded-b-[14px] border-t border-[var(--border-hairline)] bg-[var(--surface-muted)] px-6 py-3.5">
          <Text className="text-[11px]">Type your email to confirm</Text>
          <Box className="h-[30px] w-[220px] rounded-[6px]" />
          <Button size="md" className="ml-auto">
            Delete account
          </Button>
        </div>
      </SettingsCard>
    </Column>
  );
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-t border-[var(--border-hairline)] py-3.5">
      <Text className="w-[130px] shrink-0 text-[11px]">{label}</Text>
      {children}
    </div>
  );
}

function SessionRow({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action: string;
}) {
  return (
    <div className="flex items-center gap-3.5 border-t border-[var(--border-hairline)] py-3">
      <Box className="size-3.5 rounded-[3px]" />
      <div className="min-w-0">
        <Text className="text-[12px]">{title}</Text>
        <Text className="mt-0.5 text-[11px]">{detail}</Text>
      </div>
      <Button className="ml-auto">{action}</Button>
    </div>
  );
}

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    summary:
      "SwingVision imports · 5 uploads · one report per match · core stats",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$4.99 once",
    summary:
      "Unlimited uploads and reports · shot-by-shot analysis · trends · Ask",
  },
] as const;

/** Plan: the facts strip, then Free/Pro and Stripe — or the program note. */
export function SettingsPlanPending() {
  const { active, viewer } = useWorkspace();
  const isTeam = active.kind === "team";
  const isPro = viewer.plan === "pro";

  const facts = [
    { label: "Plan", value: isTeam ? "Pilot" : isPro ? "Lifetime" : "Free" },
    isTeam ? { label: "Squad", value: teamLabel(active.team) ?? "—" } : null,
    { label: "Member since", value: viewer.memberSince ?? "—" },
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null);

  return (
    <Column label="Loading plan">
      <SettingsCard className="overflow-hidden p-0">
        <div
          className={cn(
            "grid divide-y divide-[var(--border-hairline)] sm:divide-x sm:divide-y-0",
            facts.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
          )}
        >
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex min-w-0 flex-col gap-1.5 px-6 py-5"
            >
              <Text className="eyebrow whitespace-nowrap">{fact.label}</Text>
              <Text className="text-[22px] leading-[1.15] font-light tracking-[-0.4px] whitespace-nowrap">
                {fact.value}
              </Text>
            </div>
          ))}
        </div>
      </SettingsCard>

      {isTeam ? (
        <SettingsCard className="gap-2">
          <Text className="text-[12px]">
            Program plans are arranged with us directly.
          </Text>
          <Text className="text-[11px] leading-[1.6]">
            Seats, shared analysis hours and billing for {active.name} are set
            up with support rather than bought here — {SUPPORT_EMAIL}. Your own
            Free or Pro plan is separate and unaffected; switch to your personal
            workspace to change it.
          </Text>
        </SettingsCard>
      ) : (
        <>
          <SettingsCard>
            <SettingsCardTitle className="pb-2">
              Choose your plan
            </SettingsCardTitle>
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className="flex items-start gap-6 border-t border-[var(--border-hairline)] py-3"
              >
                <Box className="mt-0.5 size-[13px] rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Text className="text-[12px]">{plan.name}</Text>
                    {plan.id === (isPro ? "pro" : "free") && (
                      <Pill>Current</Pill>
                    )}
                  </div>
                  <Text className="mt-0.5 text-[11px] leading-[1.5]">
                    {plan.summary}
                  </Text>
                </div>
                <Text className="shrink-0 text-[13px]">{plan.price}</Text>
              </div>
            ))}
            <Text className="mt-3.5 border-t border-[var(--border-hairline)] pt-3.5 text-[11px] leading-[1.5]">
              Changing plan never changes your role. Pro is a one-time payment —
              there is no subscription to cancel.
            </Text>
          </SettingsCard>

          <SettingsCard className="flex-row items-center gap-4">
            <div className="min-w-0 flex-1">
              <Text className="text-[12px]">Billing is handled by Stripe.</Text>
              <Text className="mt-0.5 text-[11px]">
                Receipts and card details live there. Questions about billing?
              </Text>
            </div>
            <Button size="md">
              {isPro ? "You're on Pro" : "Upgrade to Pro"}
            </Button>
          </SettingsCard>
        </>
      )}
    </Column>
  );
}

/** Preferences: Notifications toggles, Defaults, the plan row. */
export function SettingsPreferencesPending() {
  const { active, viewer } = useWorkspace();

  return (
    <Column label="Loading preferences">
      <SettingsCard>
        <SettingsCardTitle className="pb-2">Notifications</SettingsCardTitle>
        <CardRow
          label="Email me when analysis is ready"
          description="Processing has no fixed turnaround — this is how you'll know."
          control={<Toggle />}
        />
        <CardRow label="Email me if analysis fails" control={<Toggle />} />
        {active.kind === "team" && (
          <CardRow
            label="Weekly team digest"
            description="Coaches only — Monday summary of the weekend's results."
            control={<Toggle />}
          />
        )}
      </SettingsCard>

      <SettingsCard>
        <SettingsCardTitle className="pb-2">Defaults</SettingsCardTitle>
        <CardRow
          label="Workspace on sign-in"
          control={<PillSelect>Last used</PillSelect>}
        />
        <CardRow
          label="Match report opens at"
          control={<PillSelect>The story</PillSelect>}
        />
        <CardRow
          label="Stat definitions on hover"
          description="Glossary cards on every stat label, everywhere."
          control={<Toggle />}
        />
      </SettingsCard>

      <SettingsCard className="flex-row items-center gap-4">
        <div className="min-w-0 flex-1">
          <Text className="text-[12px]">Plan: {capitalize(viewer.plan)}</Text>
        </div>
        <Text className="shrink-0 text-[11px] font-medium">Manage plan</Text>
      </SettingsCard>
    </Column>
  );
}

/** Usage: your own meter, then one card per program you belong to. */
export function SettingsUsagePending() {
  const { active, available } = useWorkspace();
  const teams = available
    .filter((workspace) => workspace.kind === "team")
    .sort((a, b) => Number(b.id === active.id) - Number(a.id === active.id));

  return (
    <Column label="Loading usage">
      <SettingsCard className="gap-3 py-5">
        <SettingsCardTitle
          trailing={<Text className="mono text-[11px]">{SAMPLE.clock}</Text>}
        >
          Your analysis time
        </SettingsCardTitle>
        <Box className="h-1.5 w-full rounded-[3px]" />
        <Text className="text-[11px]">
          Personal uploads only · resets Oct 1 · free through Dec 31, 2026
        </Text>
      </SettingsCard>

      {teams.map((team) => {
        const squad = teamLabel(team.team);
        return (
          <SettingsCard key={team.id} className="gap-3">
            <SettingsCardTitle
              trailing={
                <div className="flex items-center gap-2.5">
                  <Box className="size-5 rounded-[8px]" />
                  <Text className="mono min-w-[64px] text-center text-[11px]">
                    {SAMPLE.month}
                  </Text>
                  <Box className="size-5 rounded-[8px]" />
                </div>
              }
            >
              <span className="flex min-w-0 items-center gap-3">
                <Box className="size-8 rounded-[8px]" />
                <span className="flex min-w-0 flex-col">
                  <Text className="truncate text-[13px] font-medium">
                    {team.name}
                  </Text>
                  <Text className="truncate text-[11px] font-normal">
                    {squad ? `${squad} · shared hours` : "Shared hours"}
                  </Text>
                </span>
              </span>
            </SettingsCardTitle>

            <div className="flex items-center gap-3">
              <Box className="h-1.5 flex-1 rounded-[3px]" />
              <Text className="mono text-[11px]">{SAMPLE.clock}</Text>
            </div>

            <div className="mt-0.5 flex flex-col">
              {(team.role === "player"
                ? [SAMPLE.personName]
                : [SAMPLE.personName, SAMPLE.shortName, SAMPLE.personName]
              ).map((name, i) => (
                <div
                  key={i}
                  className="flex items-center border-b border-[var(--border-hairline)] py-2 last:border-b-0"
                >
                  <Text className="text-[12px]">{name}</Text>
                  <Text className="ml-2 text-[11px]">2 matches</Text>
                  <Text className="mono ml-auto text-[11px]">1:30</Text>
                </div>
              ))}
            </div>

            <Text className="mt-3.5 border-t border-[var(--border-hairline)] pt-3.5 text-[11px] leading-[1.5]">
              Hours reserve at submit and reconcile on completion; failed jobs
              give hours back. Players see their own line plus the team total.
            </Text>
          </SettingsCard>
        );
      })}
    </Column>
  );
}

/** Teams: the one list card — header, then one crest row per program. */
export function SettingsTeamsPending() {
  const { available } = useWorkspace();
  const teams = available.filter((workspace) => workspace.kind === "team");

  return (
    <Column label="Loading teams">
      <SettingsCard className="gap-0 pt-[18px] pb-2">
        <div className="flex items-baseline gap-2.5 pb-1.5">
          <CardTitle>Your teams</CardTitle>
          <Text className="text-[11px]">
            {teams.length} {teams.length === 1 ? "program" : "programs"}
          </Text>
        </div>
        {teams.map((team, i) => {
          const squad = teamLabel(team.team);
          return (
            <div
              key={team.id}
              className={cn(
                "flex items-center gap-3.5 py-[13px]",
                i > 0 && "shadow-[inset_0_1px_0_var(--border-hairline)]",
              )}
            >
              <Box className="size-[38px] rounded-[8px]" />
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <Text className="truncate text-[13px] font-medium">
                  {team.name}
                </Text>
                <Text className="text-[11px]">
                  {squad ? `${squad} tennis · ` : ""}12 members
                </Text>
              </div>
              <Pill>{capitalize(team.role)}</Pill>
              <Box className="size-4 rounded-[4px]" />
            </div>
          );
        })}
      </SettingsCard>
    </Column>
  );
}

/**
 * A program's own page. The role on this program is already in the
 * workspace list, so the skeleton draws the cards that role gets: staff see
 * the editable identity form and Policies, the owner also Delete, a player
 * the read-only identity, Leave and the closing note.
 */
export function SettingsTeamDetailPending() {
  const { available } = useWorkspace();
  const { programId } = useParams<{ programId?: string }>();
  const program = available.find(
    (workspace) => workspace.kind === "team" && workspace.id === programId,
  );
  const role = program?.role ?? "coach";
  const isOwner = role === "owner";
  const isStaff = role !== "player";
  const name = program?.name ?? "Program name";
  const squad = program?.team === "womens" ? "Women's tennis" : "Men's tennis";
  const lockedHint = `Ask ${SAMPLE.personName}, the owner, to change it.`;

  return (
    <Column label="Loading team">
      {/* Program hours */}
      <SettingsCard className="gap-3.5">
        <div className="flex items-baseline gap-2.5">
          <CardTitle>Program hours</CardTitle>
          <span className="flex-1" />
          <Text className="text-[11px]">Resets Oct 1 · in 18 days</Text>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <Text className="text-[24px] leading-[1.2] font-light tracking-[-0.4px]">
            {SAMPLE.hours}
          </Text>
          <Text className="text-[12px]">left of {SAMPLE.hours}</Text>
        </div>
        <Box className="h-1.5 w-full rounded-[3px]" />
        <div className="flex items-center gap-2.5">
          <Text className="text-[11px]">3h used · 4 matches · 3 people</Text>
          <span className="flex-1" />
          <Text className="text-[11px] font-medium">Breakdown by person</Text>
          <Box className="size-[11px] rounded-[3px]" />
        </div>
      </SettingsCard>

      {/* Team identity */}
      {isStaff ? (
        <SettingsCard className="gap-[18px]">
          <div className="flex items-center gap-4">
            <Box className="size-[52px] rounded-[8px]" />
            <div className="min-w-0 flex-1">
              <CardTitle>Team identity</CardTitle>
              <Text className="mt-[3px] text-[11px]">
                Crest, name and home courts — used on team match cards, the
                roster and shared reports.
              </Text>
              <div className="mt-[7px] flex items-center gap-3">
                <Text className="text-[11px] font-medium">Upload a crest</Text>
                <Text className="text-[11px]">
                  PNG, JPG, WebP or SVG · under 512 KB
                </Text>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-2 sm:gap-x-6">
            {isOwner ? (
              <>
                <Field label="Program name" value={name} height={32} />
                <Field label="Squad" value={squad} />
              </>
            ) : (
              <>
                <Field
                  label="Program name"
                  value={name}
                  height={32}
                  hint={lockedHint}
                />
                <Field
                  label="Squad"
                  value={squad}
                  height={32}
                  hint={lockedHint}
                />
              </>
            )}
            <Field label="Home venue" value={SAMPLE.venue} height={32} />
            <Field label="Default surface" value="Hard" />
            <Field
              label="Conference"
              value={SAMPLE.conference}
              height={32}
              hint={isOwner ? undefined : lockedHint}
            />
            <Field label="Season" value={SAMPLE.season} height={32} />
          </div>
          <Text className="text-[11px] leading-[1.5]">
            Venue, surface and season prefill the upload wizard — players
            won&apos;t have to type them per match.
            {isOwner &&
              " Name, squad and conference are the program's directory record — changing them changes what other schools see."}
          </Text>
        </SettingsCard>
      ) : (
        <SettingsCard className="gap-3.5">
          <div className="flex items-center gap-4">
            <Box className="size-[52px] rounded-[8px]" />
            <CardTitle>Team identity</CardTitle>
          </div>
          <div className="grid grid-cols-1 gap-3.5 border-t border-[var(--border-hairline)] pt-3.5 sm:grid-cols-2 sm:gap-x-6">
            {[
              ["Home venue", SAMPLE.venue],
              ["Default surface", "Hard"],
              ["Conference", SAMPLE.conference],
              ["Season", SAMPLE.season],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <Text className="text-[11px]">{label}</Text>
                <Text className="text-[13px]">{value}</Text>
              </div>
            ))}
          </div>
        </SettingsCard>
      )}

      {/* Members */}
      <SettingsCard>
        <div className="flex items-center gap-2.5">
          <CardTitle>Members</CardTitle>
          {isStaff && (
            <div className="flex flex-1 items-center justify-end">
              <Button>
                Manage on Roster
                <span className="size-3" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 pt-3">
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 8 }, (_, i) => (
              <Box key={i} className="size-2 rounded-[2px]" />
            ))}
          </div>
          <Text className="text-[11px]">4 of 8 seats</Text>
        </div>
        <div className="pt-2">
          {[
            { name: SAMPLE.personName, you: true, role },
            { name: SAMPLE.shortName, role: "coach" },
            { name: SAMPLE.personName, role: "player" },
            { name: SAMPLE.shortName, role: "player" },
          ].map((member, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 border-t border-[var(--border-hairline)] py-[9px]"
            >
              <Box className="size-[22px] rounded-full" />
              <Text className="truncate text-[12px] font-medium">
                {member.name}
              </Text>
              {member.you && <Pill>You</Pill>}
              <span className="flex-1" />
              {/* The owner edits every other row's role from a 28px menu;
                  other staff edit the players'. Everything else is a pill. */}
              {!member.you &&
              (isOwner || (isStaff && member.role === "player")) ? (
                <Box className="h-7 w-[92px] rounded-[6px]" />
              ) : (
                <Pill>{capitalize(member.role)}</Pill>
              )}
            </div>
          ))}
        </div>
        <Text className="mt-3.5 text-[11px] leading-[1.5]">
          {isOwner
            ? "A role change takes effect at once. Inviting and removals happen on the Roster, where an invitation can attach to a player already listed; ownership moves by transfer from a member's row."
            : isStaff
              ? "You can move people between staff and player; coaches and the owner are the owner's to change. Inviting and removals happen on the Roster."
              : "Only the coaching staff can invite people or change roles on this team."}
        </Text>
      </SettingsCard>

      {isStaff && (
        <SettingsCard className="gap-3.5">
          <SettingsCardTitle>Policies</SettingsCardTitle>
          <CardRow
            label="Who can upload team matches"
            description={withOwnerNote(
              "On-behalf uploads always show “added by”.",
              isOwner,
            )}
            control={
              <PillSelect>
                {uploadPolicyLabel(program?.uploadPolicy ?? "staff")}
              </PillSelect>
            }
          />
          <CardRow
            label="Who can create events"
            description={withOwnerNote(
              "Covers editing, scoring and deleting events too.",
              isOwner,
            )}
            control={
              <PillSelect>
                {uploadPolicyLabel(program?.eventsPolicy ?? "staff")}
              </PillSelect>
            }
          />
          <CardRow
            label="Personal uploads stay private"
            description="Players share personal matches to the program per match — never automatically."
            control={<Text className="text-[11px]">fixed</Text>}
          />
        </SettingsCard>
      )}

      {isOwner && (
        <SettingsCard className="gap-0 py-4">
          <div className="flex items-center gap-6">
            <div className="min-w-0 flex-1">
              <Text className="text-[12px]">Delete program</Text>
              <Text className="mt-0.5 text-[11px] leading-[1.5]">
                Removes the roster, schedule and every team match. Athlete-owned
                matches stay with the athlete.
              </Text>
            </div>
            <Text className="text-[11px] font-medium">Ask support</Text>
          </div>
        </SettingsCard>
      )}

      {role === "player" && (
        <>
          <SettingsCard className="gap-0 py-4">
            <div className="flex items-center gap-6">
              <div className="min-w-0 flex-1">
                <Text className="text-[12px]">Leave team</Text>
                <Text className="mt-0.5 text-[11px] leading-[1.5]">
                  You&apos;ll lose access to {name}&apos;s matches and reports.
                  Your own uploads stay in your personal workspace.
                </Text>
              </div>
              <Button>Leave team</Button>
            </div>
          </SettingsCard>
          <Text className="text-[11px] leading-[1.5]">
            You play for this team. Identity, policies and ownership are the
            coaching staff&apos;s — ask {SAMPLE.personName}, the owner.
          </Text>
        </>
      )}
    </Column>
  );
}

/** Same caveat `TeamPoliciesCard` appends for anyone but the owner. */
function withOwnerNote(base: string, canEdit: boolean): string {
  return canEdit ? base : `${base} Only the owner can change this.`;
}
