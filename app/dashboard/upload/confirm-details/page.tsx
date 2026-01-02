import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConfirmDetailsForm from "./ConfirmDetailsForm";

export default async function ConfirmDetailsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return <ConfirmDetailsForm />;
}
