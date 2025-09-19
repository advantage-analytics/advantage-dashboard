import { redirect } from "next/navigation";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { LogoutButton } from "@/components/logout-button";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 w-full p-6">
      {/* Filler Data for now */}
      <WelcomeBanner
        name="Clajerson Gimena"
        school="University of California, Los Angeles"
        classYear="Senior"
        itaRanking={26}
        winStreak={4}
        matchesClinched={1}
      />
      <LogoutButton/>
    </div>
  );
}
