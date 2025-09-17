import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientDataForm } from "@/components/dashboard/client-data-form";

export default async function Page() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-lg">
        <ClientDataForm />
      </div>
    </div>
  );
}

