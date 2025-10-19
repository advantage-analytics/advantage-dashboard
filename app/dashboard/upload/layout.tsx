import UploadSideBar from "@/components/dashboard/upload/upload-sidebar";

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full p-20">
      <div className="w-64">
        <UploadSideBar /> {/* Step 1, Step 2, Step 3 */}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
