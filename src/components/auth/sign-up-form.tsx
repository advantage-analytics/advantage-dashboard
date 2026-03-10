"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!agree) {
      setError("Please agree to the Terms and Privacy Policy.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords must match.");
      return;
    }
    const strong = /^(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/; // 8+, number & special
    if (!strong.test(password)) {
      setError(
        "Password must be at least 8 characters, include a number and a special character."
      );
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/confirm?next=/dashboard`,
        },
      });
      if (signUpError) throw signUpError;

      // User creation will happen after email confirmation (when RLS allows it)
      router.push("/sign-up-success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("space-y-5", className)} {...props}>
      <form onSubmit={handleSignUp} className="space-y-5">
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
          />
          <p className="text-xs text-muted-foreground">Enter your email address</p>
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Password must be 8 characters long, including a number and a special character.
          </p>
        </div>

        {/* Confirm */}
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <Input
            id="confirm"
            type="password"
            placeholder="Password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Passwords must be the same.</p>
        </div>

            {/* consent (did some freaky stuff to fix spacing)*/}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="consent"
                  checked={agree}
                  onCheckedChange={(v) => setAgree(Boolean(v))}
                  className="mt-0.5"
                />

                <p className="text-xs font-normal">
                  <span className="inline-flex flex-wrap items-baseline gap-0 align-baseline">
                    <span>By signing up, you agree to our</span>
                    <Link
                      href="/legal/terms-and-conditions"
                      className="mx-[4px] inline-block font-medium underline underline-offset-2 text-foreground"
                    >
                      Terms
                    </Link>
                    <span>and</span>
                    <Link
                      href="/legal/privacy-policy"
                      className="mx-[4px] inline-block font-medium underline underline-offset-2 text-foreground"
                    >
                      Privacy Policy.
                    </Link>
                  </span>
                </p>
              </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </div>
  );
}