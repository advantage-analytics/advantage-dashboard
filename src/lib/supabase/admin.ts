import { createClient } from "@supabase/supabase-js";

/**
 * Admin client with service role key for admin operations
 * Only use this for server-side operations that require admin privileges
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseServiceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY environment variable is required for admin operations",
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * A service-role client that is not built until something reads a property off
 * it.
 *
 * Every video route and loader takes the same shape: authorize first, and only
 * touch service-role data once the caller has proven it may. Passing a real
 * client in would construct one — and `createAdminClient()` THROWS when
 * `SUPABASE_SERVICE_ROLE_KEY` is unset — before the visibility check has run,
 * so a refused visit would fail on configuration rather than on authorization.
 *
 * Nine call sites had a byte-identical copy of this proxy. One home means a
 * trap added here (a destructuring caller wanting `has`, say) reaches all of
 * them instead of seven copies drifting out of sync.
 */
export function lazyAdminClient(): AdminClient {
  let admin: AdminClient | null = null;
  return new Proxy({} as AdminClient, {
    get(_target, property, receiver) {
      admin ??= createAdminClient();
      return Reflect.get(admin, property, receiver);
    },
  });
}
