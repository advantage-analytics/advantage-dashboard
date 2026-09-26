import { notFound } from "next/navigation";
import { WizardReproductionHarness } from "./wizard-reproduction-harness";

/**
 * Browser-only reproduction surface for the upload score regression.
 *
 * It deliberately mounts the production `UploadMatchFlow`, but supplies the
 * workspace it normally receives from the dashboard layout. That keeps the
 * browser test independent of authentication and a database fixture. The
 * route is a 404 in production builds and must never become product UI.
 */
export default async function WizardReproductionPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { mode } = await searchParams;
  return (
    <WizardReproductionHarness mode={mode === "preset" ? "preset" : "new"} />
  );
}
