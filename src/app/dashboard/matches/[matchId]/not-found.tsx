import { Search } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex-1 w-full bg-white flex items-center justify-center min-h-[60vh]">
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-8 flex flex-col items-center text-center max-w-sm">
        <Search className="text-[#AAAAAA] size-8" />
        <h1 className="text-[20px] font-medium text-[#0D0D0D] mt-4">
          Match Not Found
        </h1>
        <p className="text-[12px] text-[#525252] mt-2">
          The match you&apos;re looking for doesn&apos;t exist or has been
          removed.
        </p>
        <Link
          href="/dashboard/matches"
          className="mt-6 px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[11px] font-medium uppercase tracking-[1.5px] rounded-[6px] transition-colors duration-200 active:scale-[0.97]"
        >
          Back to Matches
        </Link>
      </div>
    </div>
  );
}
