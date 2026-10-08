"use server";

import { toSquad, type Squad } from "@/lib/data/squad";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, joinRequestOwnerNoticeEmail } from "@/lib/services/email";
import { getProgramOwner } from "@/lib/services/programs/program-owner";
import {
  requestToJoinCustomOrg,
  type JoinCustomOrgReason,
} from "@/lib/services/programs/join-custom-org";
import { wantsNotification } from "@/lib/services/notifications/should-notify";
import { notifyAdminsReviewNeeded } from "@/lib/services/notifications/admin-review-mail";
import {
  createCustomProgram,
  type CreateCustomProgramResult,
  type CustomOrgType,
} from "@/lib/services/programs/create-actions";
import {
  hasAcceptedCurrentPilotTerms,
  recordPilotTermsAcceptance,
  type AcceptPilotTermsResult,
} from "@/lib/services/programs/pilot-terms-actions";
import {
  PENDING_TEAM_COOKIE,
  PENDING_TEAM_COOKIE_OPTIONS,
  readPendingTeam,
  toPendingTeam,
} from "./pending-team";
import {
  CUSTOM_ORG_NAME_MAX as NAME_MAX,
  CUSTOM_ORG_NAME_MIN as NAME_MIN,
  OWNER_NAME_MAX,
} from "@/lib/services/programs/custom-org";

/**
 * The setup screen's submit (7.2), which no longer creates the team itself.
 *
 * The pilot terms stand between naming a team and owning it. So this checks
 * the values early (the name error belongs on the form the name was typed
 * into, not on the terms screen) and then:
 *
 *   * no current-version acceptance: park the values in the pending-team
 *     cookie and go to `/claim/team/terms`. `createCustomTeam` runs only from
 *     that screen's accept, after the acceptance row exists.
 *   * already accepted (a coach creating their second team): there is nothing
 *     new to agree to, so create straight away, as before. Should the RPC
 *     still refuse with `terms-not-accepted`, fall through to the screen.
 *
 * Success in either branch is a redirect; a returned value is a refusal.
 */
export async function continueToPilotTerms(input: {
  name: string;
  orgType: CustomOrgType;
  ownerName: string;
  team: Squad | null;
}): Promise<
  CreateCustomProgramResult | { ok: false; reason: "invalid-owner-name" }
> {
  const name = (input?.name ?? "").trim();
  const ownerName = (input?.ownerName ?? "").trim();
  // Length first, each against its own field: `toPendingTeam` also refuses
  // over-long text, and letting it answer would report a long name as a bad
  // team type, on a screen whose type the coach cannot change.
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, reason: "invalid-name" };
  }
  if (ownerName.length > OWNER_NAME_MAX) {
    return { ok: false, reason: "invalid-owner-name" };
  }
  // Before `toPendingTeam`, which also refuses a missing squad: its refusal
  // reads as a bad team type, and this one has its own field to point at.
  const team = toSquad(input?.team);
  if (!team) return { ok: false, reason: "invalid-team" };
  const pending = toPendingTeam({
    name,
    orgType: input?.orgType,
    ownerName,
    team,
  });
  if (!pending) return { ok: false, reason: "invalid-org-type" };

  if (await hasAcceptedCurrentPilotTerms()) {
    const result = await createCustomTeam(pending);
    if (result.ok) redirect("/claim/team/about");
    // The database disagrees that the acceptance is current (enforcement
    // live, versions out of step): the terms screen is where that is fixed.
    if (result.reason !== "terms-not-accepted") return result;
  }

  (await cookies()).set(
    PENDING_TEAM_COOKIE,
    JSON.stringify(pending),
    PENDING_TEAM_COOKIE_OPTIONS,
  );
  redirect("/claim/team/terms");
}

/**
 * The custom terms screen's submit (frame B): accept, then create the team
 * from the parked setup values.
 *
 * The acceptance is written first, through the session client, and the team
 * only after it, so there is no path that creates a team the coach has not
 * accepted terms for. A refused create (`limit-reached`, or
 * `terms-not-accepted` once enforcement is live) comes back to the screen
 * with the parked values intact.
 */
export async function acceptPilotTermsAndCreateTeam(input: {
  version: string;
}): Promise<CreateCustomProgramResult | AcceptPilotTermsResult> {
  const pending = await readPendingTeam();
  if (!pending) redirect("/claim/team/type");

  const accepted = await recordPilotTermsAcceptance(input?.version ?? "");
  if (!accepted.ok) return accepted;

  const result = await createCustomTeam(pending);
  if (!result.ok) return result;

  (await cookies()).delete({
    name: PENDING_TEAM_COOKIE,
    path: PENDING_TEAM_COOKIE_OPTIONS.path,
  });
  redirect("/claim/team/about");
}

/**
 * Create the team from setup values (Onboarding & Team Setup, 7.2). Not an
 * action of its own any more: it runs only behind `continueToPilotTerms` (an
 * acceptance already on file) or `acceptPilotTermsAndCreateTeam` (one just
 * recorded), and returns rather than redirects so each caller decides what
 * follows, including clearing the parked values.
 *
 * T2's `createCustomProgram({ name, orgType })` is the whole creation contract:
 * it writes the program and the owner membership atomically, derives the owner
 * from `auth.uid()`, sets the workspace cookie and revalidates the dashboard.
 * This action delegates to it unchanged and only adds one thing the design's
 * form promises but that action deliberately doesn't take — the coach's own
 * name.
 *
 * "Your name" is a real, editable field on 7.2, so a value typed there must go
 * somewhere or the field is a lie. It persists to the caller's OWN user row
 * (`auth.uid() = id`, the same own-row write onboarding and Settings › Profile
 * use), touching only `first_name`/`last_name` so no other profile column is
 * wiped, and best-effort: a failed name write must not sink the team creation,
 * which is the thing the coach actually asked for.
 *
 * "Your role" from the same screen has no destination here and is not sent: the
 * owner membership's role is fixed at `owner` by the RPC, and there is no
 * per-owner title column to hold "Head coach". It stays a confirmatory field —
 * see the note in `team-setup-form.tsx`.
 *
 * On success `createCustomProgram` has already set the workspace cookie, so
 * the callers' navigation is a plain redirect — to the coach intake (5.2,
 * `/claim/team/about`), which reads that cookie to know which program it is
 * asking about and hands off to the team dashboard itself; the `{ ok: false }`
 * reasons (including `limit-reached`) flow back untouched.
 */
async function createCustomTeam(input: {
  name: string;
  orgType: CustomOrgType;
  ownerName: string;
  team: Squad;
}): Promise<CreateCustomProgramResult> {
  const ownerName = (input?.ownerName ?? "").trim();

  if (ownerName.length > 0) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Everything up to the last space is the given name; the final token is
      // the family name. A single-word entry becomes the first name with an
      // empty last name, which is the honest split for a mononym.
      const parts = ownerName.split(/\s+/);
      const lastName = parts.length > 1 ? parts.pop()! : "";
      const firstName = parts.join(" ");

      const { error } = await supabase
        .from("users")
        .update({ first_name: firstName, last_name: lastName || null })
        .eq("id", user.id);

      if (error) {
        // Not fatal: the team still gets created. A name correction the coach
        // can redo in Settings is not worth failing the create over.
        console.error("[claim/team] could not save owner name", {
          message: error.message,
        });
      }
    }
  }

  // The workspace cookie and layout revalidation happen inside
  // createCustomProgram, so the callers' redirect to the intake screen
  // resolves the new program and its exit opens inside it.
  return createCustomProgram({
    name: input.name,
    orgType: input.orgType,
    team: input.team,
  });
}

/**
 * "Ask to join" on a row of the existing-teams list under 7.2's team-name
 * field: the coach found their team already on Advantage and would rather be
 * added to it than create a copy.
 *
 * Takes the program's id and nothing else typed by the client — the address
 * and name come from the session (`requestToJoinCustomOrg`). The filing is
 * the same `invite_request` row the college path files, so the org's owner
 * finds it on the roster's join requests; no `programs` row is written and
 * the pending-team cookie is left alone, because no team is being set up.
 *
 * Success is a redirect to the confirmation screen; a returned value is a
 * refusal. The two notices — owner and admin — run in `after()`, once the
 * response has left, the same way `requestInvite` sends them: the redirect
 * must not wait on mail, and they only fire for a row this call created
 * (a duplicate comes back `already-requested` before reaching them).
 */
export async function askToJoinExistingTeam(input: {
  programId: string;
  /** The 7.2 "Your role" answer — one of `CLAIM_ROLES`, or nothing. */
  role?: string;
}): Promise<{ ok: false; reason: JoinCustomOrgReason }> {
  const result = await requestToJoinCustomOrg(
    { session: await createClient(), admin: createAdminClient() },
    { programId: input?.programId ?? "", role: input?.role ?? null },
  );
  if (!result.ok) return result;

  const { programId, programName, requestId, requesterEmail, requesterName } =
    result;

  after(async () => {
    // The recipient is resolved from `program_members`, never from the
    // client, and gated on the owner's "Team activity" switch — the same
    // template and the same gate the college join request uses.
    const owner = await getProgramOwner(programId);
    if (
      owner &&
      (await wantsNotification(owner.userId, "notifyTeamActivity"))
    ) {
      const sent = await sendEmail(
        joinRequestOwnerNoticeEmail({
          to: owner.email,
          ownerName: owner.name,
          programName,
          requesterEmail,
          requesterName,
        }),
      );
      if (!sent.ok) {
        // The row is written and the roster shows it regardless; `sendEmail`
        // logged the cause.
        console.warn("[claim/team] join-request owner notice not sent", {
          programId,
        });
      }
    }

    // Not gated on there being an owner: the request sits in the admin queue
    // either way, and an admin working it needs to know it exists.
    await notifyAdminsReviewNeeded(createAdminClient(), {
      kind: "request",
      id: requestId,
      programName,
      requesterName: requesterName ?? requesterEmail,
      requesterEmail,
      reason: "New invite request — nobody has acted on it yet",
    });
  });

  redirect(`/claim/team/requested?${new URLSearchParams({ team: programId })}`);
}
