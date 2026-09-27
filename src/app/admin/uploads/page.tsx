import { AdminPage } from "@/components/admin/admin-page";
import { AdminUploadHistory } from "@/components/admin/admin-upload-history";
import { getAdminUploadHistory } from "@/lib/data/admin-uploads-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Uploads" };

export default async function AdminUploadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const cursorParam = Array.isArray(params.cursor)
    ? params.cursor[0]
    : params.cursor;
  const cursor = cursorParam ?? null;
  const result = await getAdminUploadHistory({ cursor });
  return (
    <AdminPage>
      <AdminUploadHistory result={result} cursor={cursor} />
    </AdminPage>
  );
}
