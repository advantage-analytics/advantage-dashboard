"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Match detail error:", error);
  }, [error]);

  return (
    <div className="flex-1 w-full bg-white">
      <div className="flex items-center justify-center min-h-[80vh] px-6">
        <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-8 flex flex-col items-center text-center max-w-sm w-full">
          <AlertCircle className="text-[#E51837] size-8" />
          <h1 className="text-[20px] font-medium text-[#0D0D0D] mt-4">
            Something went wrong
          </h1>
          <p className="text-[12px] text-[#525252] mt-2">
            We couldn&apos;t load this match. Please try again.
          </p>
          <button
            onClick={reset}
            className="mt-6 px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[11px] font-medium uppercase tracking-[1.5px] rounded-full transition-colors duration-200 active:scale-[0.97]"
          >
            Try Again
          </button>
          <Link
            href="/dashboard/matches"
            className="text-[#3B82F6] hover:text-[#2563EB] text-[11px] font-medium mt-3 transition-colors duration-200"
          >
            Back to Matches
          </Link>
        </div>
      </div>
    </div>
  );
}
