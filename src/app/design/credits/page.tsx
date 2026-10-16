import { notFound } from "next/navigation";
import { CreditsPreview } from "./credits-preview";

/**
 * Credit packs, every surface they touch, in fixed states — the mockups the
 * beta pricing build is chosen from. Mock markup only: nothing here reads data
 * or charges anyone.
 *
 * Gated like `/design`: a 404 on the production deployment only.
 */
export default function CreditsDesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <CreditsPreview />;
}
