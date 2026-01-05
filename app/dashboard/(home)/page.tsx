import { redirect } from "next/navigation";
import WelcomeMessage from "@/components/dashboard/home/welcome-message";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 w-full bg-white">
      {/* Hero Background Section */}
      <div className="relative w-full h-[360px] overflow-hidden">
        <img
          src="/hero.png"
          alt="Hero"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Welcome Message Overlay */}
        <div className="absolute top-[136px] left-8 z-20">
          <WelcomeMessage name="Clajerson Gimena" />
        </div>
      </div>

      {/* Main Content */}
      <div className="p-8">
       
      </div>
    </div>
  );
}
