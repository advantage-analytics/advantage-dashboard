import UploadSteps from "@/components/dashboard/upload/upload-steps";

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full">
      <div className="w-64">
        <UploadSteps /> {/* Step 1, Step 2, Step 3 */}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
