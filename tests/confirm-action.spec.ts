import { expect, test } from "@playwright/test";

import { Redirect, redirectStub } from "./fixtures/next-redirect-stub";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The POST half of `/confirm`: the only thing that spends an auth token.
 * `confirm-page.spec.ts` pins that the GET never does.
 */

type Verify = { type: string; token_hash: string };

function load(auth: {
  verifyOtp?: (args: Verify) => Promise<{ error: Error | null }>;
  exchangeCodeForSession?: (code: string) => Promise<{ error: Error | null }>;
}) {
  const loader = createLoader({
    // `Error` is handed in so the module's `instanceof Error` — which is how
    // `toAuthError` tells a Supabase `AuthError` from anything else — sees the
    // same constructor the stub below throws with, across the vm boundary.
    globals: { URL, URLSearchParams, Error },
    stubs: {
      "@/lib/supabase/server": { createClient: async () => ({ auth }) },
      "next/navigation": redirectStub,
    },
  });
  return loader.load("src/app/(auth)/confirm/actions.ts") as {
    confirmLinkForm: (formData: FormData) => Promise<void>;
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

async function landing(action: Promise<void>): Promise<string> {
  try {
    await action;
  } catch (error) {
    if (error instanceof Redirect) return error.to;
    throw error;
  }
  throw new Error("the action returned instead of redirecting");
}

test("a good token_hash signs in and lands on next", async () => {
  const calls: Verify[] = [];
  const { confirmLinkForm } = load({
    verifyOtp: async (args) => {
      calls.push(args);
      return { error: null };
    },
  });
  const to = await landing(
    confirmLinkForm(
      form({ token_hash: "abc123", type: "magiclink", next: "/claim/verify" }),
    ),
  );
  expect(calls).toEqual([{ type: "magiclink", token_hash: "abc123" }]);
  expect(to).toBe("/claim/verify");
});

test("a code exchanges for a session", async () => {
  const codes: string[] = [];
  const { confirmLinkForm } = load({
    exchangeCodeForSession: async (code) => {
      codes.push(code);
      return { error: null };
    },
  });
  const to = await landing(confirmLinkForm(form({ code: "xyz" })));
  expect(codes).toEqual(["xyz"]);
  expect(to).toBe("/dashboard");
});

test("a spent token lands on the error page with the translated message", async () => {
  const { confirmLinkForm } = load({
    verifyOtp: async () => ({
      error: new Error("Token has expired or is invalid"),
    }),
  });
  const to = await landing(
    confirmLinkForm(form({ token_hash: "abc123", type: "magiclink" })),
  );
  expect(to).toBe(
    "/error?error=That%20link%20has%20expired.%20Request%20a%20new%20one%20and%20try%20again.",
  );
});

test("a hostile next is clamped before the redirect", async () => {
  const { confirmLinkForm } = load({
    verifyOtp: async () => ({ error: null }),
  });
  const to = await landing(
    confirmLinkForm(
      form({ token_hash: "abc123", type: "email", next: "https://evil.com" }),
    ),
  );
  expect(to).toBe("/dashboard");
});

test("a form with no token never reaches Supabase", async () => {
  const { confirmLinkForm } = load({
    verifyOtp: async () => {
      throw new Error("must not be called");
    },
  });
  const to = await landing(confirmLinkForm(form({ next: "/dashboard" })));
  expect(to).toBe("/error?error=That%20link%20is%20missing%20its%20token.");
});
