import { redirect } from "next/navigation";
import WelcomeMessage from "@/components/dashboard/home/welcome-message";
import OverallPerformance from "./overall-performance";
import HomeContent from "./home-content";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 w-full bg-white">
      {/* Hero Background - Fixed to viewport */}
      <div className="fixed top-0 left-0 right-0 h-[360px] overflow-hidden -z-0">
        <img
          src="/hero.png"
          alt="Hero"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
      </div>

      {/* Main Content - Positioned above hero background */}
      <div className="relative z-10 px-8 py-12 pt-[136px]">
        {/* Two Column Layout */}
        <div className="flex flex-row gap-8">
          {/* Left Column - Flexible width, expands when sidebar toggles */}
          <div className="flex-1 flex flex-col gap-18">
            <WelcomeMessage name="Clajerson Gimena" />
            {/* Navigation Tabs + Tab Content */}
            <HomeContent />
          </div>

          {/* Right Column - Fixed 320px widget */}
          <div className="sticky top-8 w-[320px] flex-shrink-0 self-start h-fit">
            {/* Overall Performance Side Widget goes here */}
            <OverallPerformance/>
          </div>
        </div>
      </div>
    </div>
  );
}
