/**
 * A login the test suites made. `example.com` / `.org` / `.net` are reserved
 * (RFC 2606), so no real person signs up with one.
 *
 * Dependency-free so the label queue rules (`labels/queue.ts`) can use it from
 * a client component; `internal-activity-mail.ts` re-exports it.
 */
export function isTestAccountEmail(email: string | null | undefined): boolean {
  return /@example\.(com|org|net)$/i.test(email?.trim() ?? "");
}
