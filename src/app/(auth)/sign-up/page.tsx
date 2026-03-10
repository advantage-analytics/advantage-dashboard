"use client";

import Link from "next/link";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-medium">Create your account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Unlock data-driven insights for your game.
      </p>

      <div className="mt-6">
        <SignUpForm />
      </div>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Login
        </Link>
      </p>
    </>
  );
}
