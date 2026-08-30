"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createCustomProgram,
  type CreateCustomProgramResult,
  type CustomOrgType,
} from "@/lib/services/programs/create-actions";

/**
 * The setup screen's submit (Onboarding & Team Setup, 7.2).
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
 * On success `createCustomProgram` has already set the cookie, so navigation
 * into the new workspace is a plain redirect; the `{ ok: false }` reasons
 * (including `limit-reached`) flow back to the form untouched.
 */
export async function createCustomTeam(input: {
  name: string;
  orgType: CustomOrgType;
  ownerName: string;
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

  const result = await createCustomProgram({
    name: input.name,
    orgType: input.orgType,
  });

  if (!result.ok) return result;

  // The cookie and layout revalidation happened inside createCustomProgram, so
  // the next render opens inside the new team workspace.
  redirect("/dashboard/team");
}
