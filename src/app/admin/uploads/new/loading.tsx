import { AdminUploadPageSkeleton } from "@/components/admin/admin-upload-skeleton";

/**
 * Admin › Upload a match guards, then reads the chosen team's or player's
 * upload context (and, for a search, the directory) with the service role
 * before it draws. This draws the page's column, title and kind cards.
 */
export default function AdminNewUploadLoading() {
  return <AdminUploadPageSkeleton />;
}
