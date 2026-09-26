"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isAcquisitionSource,
  isRosterSizeBand,
  isWeeklyFilmBand,
  type AcquisitionSource,
  type RosterSizeBand,
  type WeeklyFilmBand,
} from "@/app/onboarding/answers";

export type SaveProgramIntakeResult = { ok: false; error: string };

/**
 * The coach intake screen's submit (Onboarding & Team Setup, 5.2).
 *
 * Every field is optional — the screen says "rough numbers are fine" and a
 * coach who answers nothing still gets to their team — so each value is either
 * null or one of `answers.ts`'s bands. The guards run before anything reaches
 * the database, so a tampered value is refused here with a sentence rather
 * than by a check constraint with a Postgres error.
 *
 * Order is deliberate. `set_program_intake` is SECURITY DEFINER and refuses
 * anyone but the program's owner (42501), so it runs first and is the gate:
 * the acquisition source lands on the caller's OWN user row only after the RPC
 * has proven they own the program the screen is about. A refused RPC returns a
 * plain error and writes nothing to `users`, so a non-owner who reached the
 * form by a stale cookie leaves no half-saved answer behind.
 *
 * The acquisition write is own-row (`auth.uid() = id`) and touches only
 * `acquisition_source`; a null answer writes nothing rather than clearing a
 * value the person gave somewhere else.
 */
export async function saveProgramIntake(input: {
  programId: string;
  rosterSizeBand: RosterSizeBand | null;
  weeklyFilmBand: WeeklyFilmBand | null;
  acquisitionSource: AcquisitionSource | null;
}): Promise<SaveProgramIntakeResult> {
  const programId = input?.programId;
  const rosterSizeBand = input?.rosterSizeBand ?? null;
  const weeklyFilmBand = input?.weeklyFilmBand ?? null;
  const acquisitionSource = input?.acquisitionSource ?? null;

  if (typeof programId !== "string" || programId.length === 0) {
    return { ok: false, error: "We couldn't tell which team this is for." };
  }
  if (rosterSizeBand !== null && !isRosterSizeBand(rosterSizeBand)) {
    return { ok: false, error: "Pick one of the roster sizes listed." };
  }
  if (weeklyFilmBand !== null && !isWeeklyFilmBand(weeklyFilmBand)) {
    return { ok: false, error: "Pick one of the filming amounts listed." };
  }
  if (acquisitionSource !== null && !isAcquisitionSource(acquisitionSource)) {
    return { ok: false, error: "Pick one of the options listed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }

  const { error: rpcError } = await supabase.rpc("set_program_intake", {
    p_program_id: programId,
    p_roster_size_band: rosterSizeBand,
    p_weekly_film_band: weeklyFilmBand,
  });

  if (rpcError) {
    if (rpcError.code === "42501") {
      return { ok: false, error: "Only the program owner can answer this." };
    }
    console.error("[claim/team/about] set_program_intake failed", {
      code: rpcError.code,
      message: rpcError.message,
    });
    return { ok: false, error: "We couldn't save that. Try again." };
  }

  if (acquisitionSource !== null) {
    const { error: userError } = await supabase
      .from("users")
      .update({ acquisition_source: acquisitionSource })
      .eq("id", user.id);

    if (userError) {
      console.error("[claim/team/about] could not save acquisition source", {
        message: userError.message,
      });
      return { ok: false, error: "We couldn't save that. Try again." };
    }
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/team");
}
