"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // helper to check if user profile is complete
  const checkProfileAndRedirect = async (supabase: ReturnType<typeof createClient>) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw userError ?? new Error("User not found");

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("phone, dob, state, country, role")
      .eq("id", user.id)
      .single();

    if (profileError) throw profileError;

    const isIncomplete =
      !profile.phone || !profile.dob || !profile.state || !profile.country || !profile.role;

    if (isIncomplete) {
      router.push("/dashboard/settings");
    } else {
      router.push("/dashboard");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      await checkProfileAndRedirect(supabase);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Google OAuth
  const handleGoogleOAuth = async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    if (error) {
      setError(error.message);
      return;
    }

    if (data?.url) {
      // Let Supabase handle redirect, then check profile after returning
      window.location.href = data.url;
    }
  };

  return (
    <div className={cn("flex h-full w-full flex-col", className)} {...props}>
      {/* Top */}
      <form onSubmit={handleLogin} className="space-y-5">
        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <p className="text-xs text-muted-foreground">Enter your email address</p>
        </div>

        {/* Password forgot */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/auth/forgot-password" className="text-xs underline underline-offset-2">
              Forgot your password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <p className="text-xs text-muted-foreground">Enter your password</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Logging in..." : "Login"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/auth/sign-up" className="underline underline-offset-2">
            Sign up
          </Link>
        </p>
      </form>

      {/* Bottom*/}
      <div className="mt-auto pt-1">
        <div className="relative my-4 text-center text-xs text-muted-foreground">
          <span className="bg-white px-2 relative z-10">OR</span>
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border" />
        </div>

        <Button
          onClick={handleGoogleOAuth}
          type="button"
          variant="outline"
          className="w-full bg-[#f2f2f2] hover:bg-[#e8e8e8] border-0 flex items-center justify-center gap-3 h-10 font-medium text-[#3c4043]"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fillRule="evenodd">
              <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </g>
          </svg>
          <span>Sign in with Google</span>
        </Button>
      </div>
    </div>
  );
}
