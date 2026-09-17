import { AdminPage } from "@/components/admin/admin-page";
import { AdminUploadHistory } from "@/components/admin/admin-upload-history";

export default function AdminUploadsLoading() {
  return (
    <AdminPage>
      <AdminUploadHistory loading />
    </AdminPage>
  );
}
