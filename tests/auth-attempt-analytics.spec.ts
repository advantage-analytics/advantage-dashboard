import { expect, test } from "@playwright/test";
import { loginFailureReason } from "../src/lib/auth/login-failure";
import { validateEmail } from "../src/lib/auth/error-messages";
import {
  signUpFormRefusal,
  signUpServerReason,
} from "../src/lib/auth/sign-up-refusal";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Sign-in and sign-up attempts that go nowhere (PostHog, 2026-11-28): five
 * dead taps on "Continue with Google" with nothing captured, and seven
 * refused /sign-up submits with nothing captured. `login_started` marks the
 * Google tap before any await, `login_failed { method: "google" }` now
 * covers an answer with no URL and a thrown error, and `sign_up_refused`
 * names the field and rule of each refused submit — slugs only, never a
 * typed value.
 *
 * The forms are driven through the vm loader with React's state, Supabase
 * and posthog-js stubbed. Nothing here opens a network or a database.
 */

type Capture = { event: string; properties: unknown };
type Element = { type: unknown; props: Record<string, unknown> };

function findElement(
  node: unknown,
  match: (el: Element) => boolean,
): Element | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, match);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as Element;
  if (el.props && match(el)) return el;
  return el.props ? findElement(el.props.children, match) : null;
}

function loadForm(
  file: string,
  supabaseAuth: Record<string, unknown>,
  options: {
    seed?: Record<number, unknown>;
    fields?: Record<string, string>;
  } = {},
) {
  const captures: Capture[] = [];
  const setCalls: unknown[] = [];
  const window = {
    location: {
      protocol: "https:",
      origin: "https://app.example",
      href: "https://app.example/login",
      search: "",
    },
  };
  let cursor = 0;
  const posthog = {
    capture: (event: string, properties: unknown) =>
      captures.push({ event, properties }),
    identify: () => {},
    get_distinct_id: () => "anon",
    setPersonProperties: () => {},
  };
  const loader = createLoader({
    stubs: {
      react: {
        useState: (init: unknown) => {
          const index = cursor++;
          const value =
            options.seed && index in options.seed ? options.seed[index] : init;
          return [value, (next: unknown) => setCalls.push(next)];
        },
      },
      "next/navigation": { useRouter: () => ({ push: () => {} }) },
      "next/link": { __esModule: true, default: () => null },
      "posthog-js": { __esModule: true, default: posthog },
      "@/lib/posthog-client": { isPostHogConfigured: true },
      "@/lib/supabase/client": { createClient: () => ({ auth: supabaseAuth }) },
      "@/lib/auth/form-fields": {
        readFormFields: () => options.fields ?? {},
      },
    },
    globals: {
      window,
      document: { cookie: "" },
      sessionStorage: { getItem: () => null, setItem: () => {} },
      URLSearchParams,
    },
  });
  const mod = loader.load(file);
  return { mod, captures, setCalls, window };
}

// -- Google sign-in --------------------------------------------------------

async function tapGoogle(signInWithOAuth: () => Promise<unknown>) {
  const { mod, captures, setCalls, window } = loadForm(
    "src/components/auth/login-form.tsx",
    { signInWithOAuth },
  );
  const tree = (mod.LoginForm as (p: object) => unknown)({});
  const button = findElement(
    tree,
    (el) => el.type === "button" && el.props.type === "button",
  );
  expect(button, "the Continue with Google button").not.toBeNull();
  await (button!.props.onClick as () => Promise<void>)();
  return { captures, setCalls, window };
}

test("a Google tap is captured before the round trip, and a redirect sends nothing else", async () => {
  const { captures, window } = await tapGoogle(async () => ({
    data: { url: "https://accounts.example/authorize" },
    error: null,
  }));
  expect(captures).toEqual([
    { event: "login_started", properties: { method: "google" } },
  ]);
  expect(window.location.href).toBe("https://accounts.example/authorize");
});

test("an answer with no URL is a login_failed, and the form says so", async () => {
  const { captures, setCalls, window } = await tapGoogle(async () => ({
    data: { url: null },
    error: null,
  }));
  expect(captures).toEqual([
    { event: "login_started", properties: { method: "google" } },
    {
      event: "login_failed",
      properties: { method: "google", reason: "no_redirect_url" },
    },
  ]);
  expect(window.location.href).toBe("https://app.example/login");
  expect(setCalls).toContainEqual({
    field: "form",
    message: "Something went wrong. Try again in a moment.",
  });
});

test("a thrown sign-in is a login_failed too, not an unhandled rejection", async () => {
  const { captures } = await tapGoogle(async () => {
    throw new TypeError("Failed to fetch");
  });
  expect(captures).toEqual([
    { event: "login_started", properties: { method: "google" } },
    {
      event: "login_failed",
      properties: { method: "google", reason: "network" },
    },
  ]);
});

test("a Supabase error still reads its reason from the error", async () => {
  const { captures } = await tapGoogle(async () => ({
    data: { url: null },
    error: { message: "Too many requests", code: "over_request_rate_limit" },
  }));
  expect(captures[1]).toEqual({
    event: "login_failed",
    properties: { method: "google", reason: "rate_limited" },
  });
});

test("no_redirect_url is a reason slug of its own", () => {
  expect(loginFailureReason({ code: "no_redirect_url" })).toBe(
    "no_redirect_url",
  );
});

// -- Sign-up ---------------------------------------------------------------

const TYPED = {
  email: "player@example.com",
  password: "Rally-2026!",
  "confirm-password": "Rally-2026!",
};

// useState order in SignUpForm: email, password, confirm, agree, error, isLoading.
const AGREED = { 3: true };

async function submitSignUp(
  fields: Record<string, string>,
  seed: Record<number, unknown>,
  signUp: () => Promise<unknown> = async () => {
    throw new Error("signUp should not be reached");
  },
) {
  const { mod, captures, setCalls } = loadForm(
    "src/components/auth/sign-up-form.tsx",
    { signUp },
    { seed, fields },
  );
  const tree = (mod.SignUpForm as (p: object) => unknown)({});
  const form = findElement(tree, (el) => el.type === "form");
  await (form!.props.onSubmit as (e: object) => Promise<void>)({
    preventDefault: () => {},
    currentTarget: {},
  });
  return { captures, setCalls };
}

const refusedSubmits: Array<{
  name: string;
  fields: Record<string, string>;
  seed: Record<number, unknown>;
  field: string;
  reason: string;
}> = [
  {
    name: "an empty address",
    fields: { ...TYPED, email: " " },
    seed: AGREED,
    field: "email",
    reason: "email_missing",
  },
  {
    name: "an address with two @",
    fields: { ...TYPED, email: "a@b@example.com" },
    seed: AGREED,
    field: "email",
    reason: "email_malformed",
  },
  {
    name: "an address with no domain",
    fields: { ...TYPED, email: "player@example" },
    seed: AGREED,
    field: "email",
    reason: "email_no_domain",
  },
  {
    name: "a password off the rule",
    fields: { ...TYPED, password: "short", "confirm-password": "short" },
    seed: AGREED,
    field: "password",
    reason: "password_rule",
  },
  {
    name: "passwords that differ",
    fields: { ...TYPED, "confirm-password": "Rally-2027!" },
    seed: AGREED,
    field: "confirm",
    reason: "passwords_differ",
  },
  {
    name: "the terms left unticked",
    fields: TYPED,
    seed: {},
    field: "consent",
    reason: "terms_not_agreed",
  },
];

for (const c of refusedSubmits) {
  test(`a sign-up refused for ${c.name} sends its field and rule only`, async () => {
    const { captures, setCalls } = await submitSignUp(c.fields, c.seed);
    expect(captures).toEqual([
      {
        event: "sign_up_refused",
        properties: { field: c.field, reason: c.reason },
      },
    ]);
    expect(setCalls).toContainEqual(
      expect.objectContaining({ field: c.field }),
    );
  });
}

test("a sign-up Supabase refuses is captured with a slug, never the address", async () => {
  const { captures, setCalls } = await submitSignUp(
    TYPED,
    AGREED,
    async () => ({
      data: { user: null },
      error: Object.assign(new Error("User already registered"), {
        code: "user_already_exists",
      }),
    }),
  );
  expect(captures).toEqual([
    {
      event: "sign_up_refused",
      properties: { field: "email", reason: "already_registered" },
    },
  ]);
  expect(JSON.stringify(captures)).not.toContain("example.com");
  expect(setCalls).toContainEqual({
    field: "email",
    message: "That email already has an account. Sign in instead.",
  });
});

test("the form's checks keep their messages and order", () => {
  expect(
    signUpFormRefusal({ email: "", password: "", confirm: "" }, false),
  ).toEqual({
    field: "email",
    reason: "email_missing",
    message: validateEmail(""),
  });
  expect(
    signUpFormRefusal(
      {
        email: TYPED.email,
        password: TYPED.password,
        confirm: TYPED.password,
      },
      true,
    ),
  ).toBeNull();
});

test("Supabase's sign-up refusals map to fixed slugs; anything else is 'unknown'", () => {
  expect(signUpServerReason({ code: "weak_password" })).toBe("weak_password");
  expect(signUpServerReason({ code: "over_email_send_rate_limit" })).toBe(
    "rate_limited",
  );
  expect(
    signUpServerReason(new Error("Signups not allowed for this instance")),
  ).toBe("signup_disabled");
  expect(
    signUpServerReason(new Error("Password should be at least 8 characters")),
  ).toBe("weak_password");
  expect(signUpServerReason(new TypeError("Failed to fetch"))).toBe("network");
  expect(
    signUpServerReason(new Error("player@example.com could not be found")),
  ).toBe("unknown");
  expect(signUpServerReason(undefined)).toBe("unknown");
});
