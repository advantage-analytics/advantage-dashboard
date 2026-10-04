/**
 * Request header `updateSession()` (`lib/supabase/middleware.ts`) stamps with
 * the path and query the browser asked for. Server Components cannot read the
 * request URL themselves, and a login gate needs it to build `?next=`.
 *
 * Its own module so the proxy imports a string, not `next/headers`.
 */
export const REQUEST_PATH_HEADER = "x-advantage-request-path";
