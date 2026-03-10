// components/auth/forgot-password-form.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * trash attempt at
 */
const UI = {
  offsetTop: 0,     
  offsetLeft: 0,   
  titleSize: 24,    
  titleLine: 28,    
  descSize: 14,     
  descLine: 22,     
  blockGap: 24,     
};

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ paddingTop: UI.offsetTop, paddingLeft: UI.offsetLeft }}
    >
      {/* Heading description */}
      <div>
        <h1
          className="font-semibold"
          style={{ fontSize: UI.titleSize, lineHeight: `${UI.titleLine}px` }}
        >
          Reset Password
        </h1>
        <p
          className="text-sm"
          style={{
            marginTop: 8,
            fontSize: UI.descSize,
            lineHeight: `${UI.descLine}px`,
            maxWidth: 420,
          }}
        >
          Type in your email and we&apos;ll send you a link to reset your
          password
        </p>
      </div>

      {/* Form */}
      <form onSubmit={onSubmit} className="space-y-4" style={{ marginTop: UI.blockGap }}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <p className="text-sm text-muted-foreground">Enter your email address</p>
        </div>

        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
        {sent && (
          <p className="text-sm text-foreground" role="status">
            Check your email for a password reset link.
          </p>
        )}

        <Button
          type="submit"
          className="w-full bg-black text-white hover:bg-black/90"
          disabled={isLoading}
        >
          {isLoading ? "Sending..." : "Send reset email"}
        </Button>
      </form>

      {/* Footer */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline underline-offset-2">
          Login
        </Link>
      </p>
    </div>
  );
}
