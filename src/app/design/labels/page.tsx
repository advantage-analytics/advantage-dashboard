import { notFound } from "next/navigation";
import { LabelsDesignPreview } from "./labels-preview";

/**
 * The label pages, reachable without a session: a match's overview and the
 * Labels list grouped by program and player.
 *
 * `/admin/labels` needs an admin and a real job, and its overview a seeded
 * session, so none of it can be opened by navigating. This renders the real
 * components on a made-up match (`fixture.ts`): nothing is read and nothing
 * can be written. Gated like `/design`: a 404 on the production deployment
 * only.
 */
export default function LabelsDesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <LabelsDesignPreview />;
}
