import { SCHEDULE_ENABLED } from "@/lib/schedule/availability";

/**
 * The tray's "Getting set up" section, as data.
 *
 * Setup is a standing state, and everything else in the tray moves and clears
 * itself — so these steps are deliberately kept out of the tray's arithmetic.
 * They are not `unread`, not a part of `trayDetail`'s sentence, and never a
 * reason to light the trigger's dot: a dot that stays on until somebody visits
 * Settings teaches people to ignore the one signal jobs and invitations have.
 * Inside the open panel they read as a to-do list, in grey.
 *
 * Each label is an imperative, so the same words read as the ask while the
 * step is open and as a ticked-off item once it is done. `action` is the
 * trailing grey word, and like a stopped row's it names where the click goes.
 *
 * No React, no Next, no Supabase: the loader supplies facts, this turns them
 * into rows, and a spec can assert the rows without rendering anything.
 */
export interface SetupStep {
  key: string;
  label: string;
  done: boolean;
  href: string;
  action: string;
}

/** `users.hand` + `users.backhand`, and a `user_preferences` row. */
export interface PersonalSetupFacts {
  playingProfile: boolean;
  notifications: boolean;
}

/** Roster and schedule by presence; `match` by Team Home's own rule. */
export interface TeamSetupFacts {
  roster: boolean;
  schedule: boolean;
  match: boolean;
}

export function personalSetupSteps(facts: PersonalSetupFacts): SetupStep[] {
  return [
    {
      key: "playingProfile",
      label: "Set your hand and backhand",
      done: facts.playingProfile,
      href: "/dashboard/settings/profile",
      action: "Profile",
    },
    {
      key: "notifications",
      label: "Choose report notifications",
      done: facts.notifications,
      href: "/dashboard/settings/preferences",
      action: "Preferences",
    },
  ];
}

/**
 * While the Schedule is a coming-soon page there is nowhere to add a dual, so
 * the step is dropped and the section counts two — the same rule Team Home's
 * own line follows (`team-setup-line.tsx`).
 */
export function teamSetupSteps(
  facts: TeamSetupFacts,
  scheduleEnabled: boolean = SCHEDULE_ENABLED,
): SetupStep[] {
  const steps: SetupStep[] = [
    {
      key: "roster",
      label: "Add players to the roster",
      done: facts.roster,
      href: "/dashboard/team/roster",
      action: "Roster",
    },
    {
      key: "schedule",
      label: "Add a dual to the schedule",
      done: facts.schedule,
      href: "/dashboard/team/schedule/new/dual",
      action: "Schedule",
    },
    {
      key: "match",
      label: "Send a first match",
      done: facts.match,
      href: "/dashboard/matches/new",
      action: "New match",
    },
  ];
  return steps.filter((step) => scheduleEnabled || step.key !== "schedule");
}

/**
 * Nothing outstanding, nothing rendered. The section leaves once, whole,
 * rather than lingering as a list of ticks — the rule both Home lines keep.
 */
export function setupOutstanding(steps: readonly SetupStep[]): boolean {
  return steps.some((step) => !step.done);
}
