import { redirect } from "next/navigation";

/**
 * Uploads stopped being a tab in the admin console redesign: every upload is
 * a row on Matches, with its progress in the Status column. The old address
 * keeps working. `/admin/uploads/new` (the admin upload wizard) is unchanged.
 */
export default function AdminUploadsPage() {
  redirect("/admin/matches");
}
