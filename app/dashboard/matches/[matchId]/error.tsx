"use client";

import { useEffect } from "react";
import { Calendars } from "lucide-react";

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
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 pt-[136px]">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="h-16 w-16 rounded-2xl bg-red-100 flex items-center justify-center">
            <Calendars className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="font-medium text-2xl text-[#0D0D0D]">
            Something went wrong
          </h1>
          <p className="font-normal text-base text-[#999999]">
            We couldn't load this match. Please try again.
          </p>
          <button
            onClick={reset}
            className="mt-6 px-6 py-2 bg-[#1D1D1F] text-white rounded-lg hover:bg-[#2D2D2D] transition-colors font-medium text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
