import { Info } from "lucide-react";

export default function HelpCenterPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 pt-[136px]">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
          <Info className="h-8 w-8 text-gray-400" />
        </div>
        <h1 className="font-medium text-2xl text-[#0D0D0D]">Help Center</h1>
        <p className="font-normal text-base text-[#888888] max-w-md">
          Get support and learn how to make the most of Advantage Analytics.
        </p>
      </div>
    </div>
  );
}
