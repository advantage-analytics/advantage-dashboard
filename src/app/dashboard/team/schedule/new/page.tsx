import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { StaticEventChooser } from "@/components/dashboard/schedule/static/static-event-chooser";

/**
 * 3b — New event, as a page rather than a dropdown.
 *
 * It reads nothing. The two answers it offers are the two forms below it, and
 * the guard is here anyway for the same reason it is on `new/dual`: a hidden
 * menu item is not authorization, and a player who types this URL should land
 * back on the schedule they are allowed to read rather than on a chooser whose
 * every destination would refuse them.
 *
 * The body is now `StaticEventChooser` — a literal rebuild of the `3b`
 * artboard. `new-event-chooser.tsx`, the prior DB-wired body, has since been
 * deleted (dormant and unreachable; see `README.md` §2). Nothing above this
 * line changed: the guards are the route's job, not the body's, and they
 * stay whether the screen is fixture-backed or live.
 */
export default async function NewEventPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  if (!isProgramStaff(active)) redirect("/dashboard/team/schedule");

  return <StaticEventChooser />;
}
