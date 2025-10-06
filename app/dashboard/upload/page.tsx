import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadClient from "./client";

export default async function Page() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return <UploadClient/>;
}
