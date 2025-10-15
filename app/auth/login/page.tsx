"use client";

import { LoginForm } from "@/components/auth/login-form";

export default function Page() {
  return (
    <section className="w-full max-w-md">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
      </p>

      <div className="mt-6">
        <LoginForm />
      </div>
    </section>
  );
}