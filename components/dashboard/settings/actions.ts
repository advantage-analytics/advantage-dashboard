"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function deleteAccount() {
  const supabase = await createClient();
  
  // Get the current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  try {
    // First, delete the user's row from the users table
    const { error: deleteUserError } = await supabase
      .from("users")
      .delete()
      .eq("id", user.id);

    if (deleteUserError) {
      console.error("Error deleting user data:", deleteUserError);
      // Continue with auth deletion even if user data deletion fails
    }

    // Use admin client to delete the user from Supabase auth
    const adminClient = createAdminClient();
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(
      user.id
    );

    if (deleteAuthError) {
      throw new Error("Failed to delete account. Please contact support.");
    }

    // Revalidate the layout to clear any cached user data
    revalidatePath("/", "layout");
    
    // Redirect to home page
    redirect("/");
    
  } catch (error) {
    console.error("Delete account error:", error);
    throw error;
  }
}