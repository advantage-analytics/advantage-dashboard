import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

export default async function Home() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }
  
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation Bar */}

      {/* Main content */}
      <main className="flex-1 bg-gray-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Welcome to Your Dashboard</h1>
          <p>Find all your statistics here!</p>
          
          <Button variant="default">
          I am a button
          </Button>
        </div>
      </main>
    </div>
  );
}