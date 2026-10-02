import { redirect } from "next/navigation";

/**
 * `/admin` has no page of its own — Teams is the admin console's front door.
 * The layout above this already gates the whole area, so this is just the
 * landing hop.
 */
export default function AdminIndexPage() {
  redirect("/admin/teams");
}
