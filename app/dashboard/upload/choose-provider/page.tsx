import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChooseProviderClient from "./client";

export default async function ChooseProviderPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <>
      <div className="flex-1 w-full p-6 h-full">
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">
              Choose Provider
            </h2>
            <p className="text-sm text-muted-foreground">
              Choose from the following Electronic Line Calling (ELC) Providers
            </p>
          </div>
          <ChooseProviderClient />;
        </div>
      </div>
      ;
    </>
  );
}
