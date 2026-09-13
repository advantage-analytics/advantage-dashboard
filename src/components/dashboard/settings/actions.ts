"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface ProfileInput {
  firstName?: string;
  lastName?: string;
  birthdate?: string;
  phone?: string;
  country?: string;
  state?: string;
  role?: string;
}

const emptyToNull = (v?: string): string | null => {
  if (v === undefined) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
};

export async function saveProfile(input: ProfileInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Not signed in. Please log back in." };
  }

  const { error } = await supabase
    .from("users")
    .update({
      first_name: emptyToNull(input.firstName),
      last_name: emptyToNull(input.lastName),
      dob: emptyToNull(input.birthdate),
      phone: emptyToNull(input.phone),
      country: emptyToNull(input.country),
      state: emptyToNull(input.state),
      role: emptyToNull(input.role),
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/settings/profile");
  return { ok: true };
}

export async function requestPasswordReset(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return { ok: false, error: "Not signed in. Please log back in." };
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `${headerList.get("x-forwarded-proto") ?? "https"}://${headerList.get("host")}`;

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${origin}/auth/update-password`,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function deleteAccount(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Your session expired. Sign in again to delete your account." };
  }

  const adminClient = createAdminClient();
  const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteAuthError) {
    return { ok: false, error: deleteAuthError.message };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
