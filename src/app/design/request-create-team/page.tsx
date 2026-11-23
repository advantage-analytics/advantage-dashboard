import { notFound } from "next/navigation";
import { RequestCreateTeamPreview } from "./request-create-team-preview";

/**
 * Admin › Requests: an unlisted-program request answered with Create team.
 *
 * The shipped `RequestDrawer` and `CreateTeamDialog` on fixture rows — the
 * open request, then the two ways it can close. Reads no data and needs no
 * session; Create team opens the real dialog, whose submit refuses without an
 * admin session. Gated like `/design`: a 404 on the production deployment only.
 */
export default function RequestCreateTeamDesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <RequestCreateTeamPreview />;
}
