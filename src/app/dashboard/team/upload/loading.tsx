import { UploadWizardPending } from "@/components/dashboard/loading/upload-wizard-pending";

/** Every in-app link here carries `?entry=`: the pinned wizard, on its file step. */
export default function Loading() {
  return <UploadWizardPending pinned />;
}
