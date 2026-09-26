import { UploadWizardPending } from "@/components/dashboard/loading/upload-wizard-pending";

/** A fresh wizard, on its provider step. */
export default function Loading() {
  return <UploadWizardPending pinned={false} />;
}
