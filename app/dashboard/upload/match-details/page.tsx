import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "./UploadForm";

export default async function MatchDetailsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return <UploadForm />;
}
