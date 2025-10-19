import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ConfirmDetailsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return "Confirm Details";
}
