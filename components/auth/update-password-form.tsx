// components/auth/update-password-form.tsx
"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // route to an authenticated page if in already
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex h-full w-full flex-col", className)} {...props}>
      {/* Heading  description */}
      <div>
        <h1 className="text-[24px] leading-[28px] font-semibold">Reset Password</h1>
        <p className="mt-2 text-[14px] leading-[22px]">
          Please enter your new password below.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleUpdatePassword} className="mt-6 space-y-4 -ml-[0px]">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="New password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Enter your new password</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button
          type="submit"
          className="w-full bg-black text-white hover:bg-black/90"
          disabled={isLoading}
        >
          {isLoading ? "Saving..." : "Save new password"}
        </Button>
      </form>
    </div>
  );
}
