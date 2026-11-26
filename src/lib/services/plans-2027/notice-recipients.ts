/**
 * Who receives the December plans notice (stage 0 of
 * `docs/plans/2027-pricing.md`), as a pure function so the selection is
 * tested without a database and the send script only fetches and sends.
 *
 *  - **Pilot**: owners and coaches of the pilot teams get the pilot wording,
 *    one mail per team they run, once that mail can go: the wording is
 *    approved (`pilotNoticeReady`) and the team has a `pilot_ends_on`. They
 *    get no general mail as well: the pilot mail already says their own
 *    workspace's beta hours end.
 *  - **Held pilot**: a pilot coach whose pilot mail can't go yet. They get
 *    the GENERAL notice instead, so nobody goes unnotified while the pilot
 *    wording waits (`pilotHeld` names them; they are inside `general`). When
 *    the pilot mail is ready later they get that too, under its own key.
 *  - **General**: every other account with a confirmed address — players,
 *    staff, owners of non-pilot teams, and the players on pilot teams (their
 *    own workspace is the one losing its hours).
 *  - **Skipped**: unconfirmed or banned accounts, and test addresses.
 *
 * `teamOwners` is reported separately because the plan asks for the count; it
 * is a subset of `general`, not an extra send.
 */

/**
 * The four schools that stay on pilot from January 1 (decision 3; SplitStep
 * confirmed UCLA, Babson and TCU on 2026-11-26). TCU has no team on Advantage
 * yet — add its program id here once it exists.
 */
export const PILOT_2027_PROGRAM_IDS: readonly string[] = [
  "ab67f388-b0ef-4140-8119-d337568d76f6", // University of Georgia, women's
  "a8e46b09-6a82-4700-bdc9-078ad45dc609", // UCLA, men's
  "0338b5cb-a20a-44ad-b2a3-7ab1446b6e45", // UCLA, women's
  "f94f55e4-023e-4118-b718-8d2263296748", // Babson College, men's
];

export interface NoticeAccount {
  id: string;
  email: string | null;
  confirmed: boolean;
  banned: boolean;
}

export interface NoticeMembership {
  programId: string;
  userId: string;
  role: string;
}

export interface NoticeProgram {
  id: string;
  name: string;
  ownerUserId: string | null;
  /** `YYYY-MM-DD`, or null when no end date has been set yet. */
  pilotEndsOn: string | null;
}

export interface GeneralRecipient {
  userId: string;
  email: string;
}

export interface PilotRecipient extends GeneralRecipient {
  programId: string;
  programName: string;
  pilotEndsOn: string | null;
}

export interface NoticeRecipients {
  general: GeneralRecipient[];
  /** Pilot mails that can go now: wording approved, end date set. */
  pilot: PilotRecipient[];
  /** Pilot coaches whose pilot mail can't go yet — already inside `general`. */
  pilotHeld: PilotRecipient[];
  /** Owners of non-pilot teams — already inside `general`. */
  teamOwners: GeneralRecipient[];
  /** Pilot ids with no program row (TCU until it joins). */
  missingPilotPrograms: string[];
  skipped: { userId: string; reason: "unconfirmed" | "banned" | "test" }[];
}

/** example.com / .test / .invalid — seeded fixtures and harness accounts. */
export function isTestAddress(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return (
    domain === "example.com" ||
    domain === "example.org" ||
    domain.endsWith(".example.com") ||
    domain.endsWith(".test") ||
    domain.endsWith(".invalid")
  );
}

export function selectNoticeRecipients(input: {
  accounts: NoticeAccount[];
  memberships: NoticeMembership[];
  programs: NoticeProgram[];
  pilotProgramIds?: readonly string[];
  /** `PILOT_NOTICE_APPROVED`. False holds every pilot mail. */
  pilotNoticeReady: boolean;
  /** Extra addresses to leave out (the verifier accounts), lower-cased. */
  excludeEmails?: readonly string[];
}): NoticeRecipients {
  const pilotIds = new Set(input.pilotProgramIds ?? PILOT_2027_PROGRAM_IDS);
  const exclude = new Set(
    (input.excludeEmails ?? []).map((e) => e.toLowerCase()),
  );
  const programs = new Map(input.programs.map((p) => [p.id, p]));

  const skipped: NoticeRecipients["skipped"] = [];
  const sendable = new Map<string, GeneralRecipient>();
  for (const a of input.accounts) {
    if (!a.email) continue;
    if (a.banned) skipped.push({ userId: a.id, reason: "banned" });
    else if (!a.confirmed)
      skipped.push({ userId: a.id, reason: "unconfirmed" });
    else if (isTestAddress(a.email) || exclude.has(a.email.toLowerCase()))
      skipped.push({ userId: a.id, reason: "test" });
    else sendable.set(a.id, { userId: a.id, email: a.email });
  }

  // Who runs each pilot team: its owner, plus anyone holding owner or coach.
  const pilot: PilotRecipient[] = [];
  const pilotSeen = new Set<string>();
  const addPilot = (program: NoticeProgram, userId: string) => {
    const account = sendable.get(userId);
    const key = `${program.id}:${userId}`;
    if (!account || pilotSeen.has(key)) return;
    pilotSeen.add(key);
    pilot.push({
      ...account,
      programId: program.id,
      programName: program.name,
      pilotEndsOn: program.pilotEndsOn,
    });
  };
  for (const id of pilotIds) {
    const program = programs.get(id);
    if (!program) continue;
    if (program.ownerUserId) addPilot(program, program.ownerUserId);
    for (const m of input.memberships) {
      if (m.programId === id && (m.role === "owner" || m.role === "coach"))
        addPilot(program, m.userId);
    }
  }

  const ready = (p: PilotRecipient) =>
    input.pilotNoticeReady && p.pilotEndsOn !== null;
  const pilotReady = pilot.filter(ready);
  const pilotUsers = new Set(pilotReady.map((p) => p.userId));
  const general = [...sendable.values()].filter(
    (r) => !pilotUsers.has(r.userId),
  );

  const ownerIds = new Set(
    input.programs
      .filter((p) => p.ownerUserId && !pilotIds.has(p.id))
      .map((p) => p.ownerUserId as string),
  );
  const teamOwners = general.filter((r) => ownerIds.has(r.userId));

  return {
    general,
    pilot: pilotReady,
    pilotHeld: pilot.filter((p) => !ready(p)),
    teamOwners,
    missingPilotPrograms: [...pilotIds].filter((id) => !programs.has(id)),
    skipped,
  };
}

/** One send, one key: re-running the script never mails anyone twice. */
export function noticeDedupeKey(r: GeneralRecipient | PilotRecipient): string {
  return "programId" in r
    ? `plans_2027_pilot_notice:${r.programId}:${r.userId}`
    : `plans_2027_notice:${r.userId}`;
}
