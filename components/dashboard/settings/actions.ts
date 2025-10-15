"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function deleteAccount() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const adminClient = createAdminClient();
  const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteAuthError) {
    throw new Error("Failed to delete account. Please contact support.");
  }

  revalidatePath("/", "layout");
  redirect("/");
}