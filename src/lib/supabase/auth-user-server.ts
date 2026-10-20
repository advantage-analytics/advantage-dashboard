import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user, verified by Supabase Auth — one network round trip per
 * request, however many loaders ask.
 *
 * `getUser()` rather than `getClaims()`: this project still signs access
 * tokens with the legacy symmetric (HS256) secret — its JWKS endpoint
 * (`/auth/v1/.well-known/jwks.json`) publishes no keys — and for an HS256
 * token `getClaims()` cannot verify locally and falls back to the same
 * `getUser()` call. Switching would buy nothing until the project moves to
 * asymmetric signing keys, and `getUser()` also catches a session revoked
 * server-side, which a locally verified JWT would not until it expires.
 * Revisit both halves together if the signing keys change.
 *
 * `cache()`d, so inside one Server Component render the layout, the page and
 * every loader beneath them share one answer. Route handlers are not React
 * renders and get no memoisation — each call there still verifies.
 */
export const getAuthUser = cache(
  async function getAuthUser(): Promise<User | null> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  },
);
