import { Calendars } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex-1 w-full bg-white">
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 pt-[136px]">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
            <Calendars className="h-8 w-8 text-gray-400" />
          </div>
          <h1 className="font-medium text-2xl text-[#0D0D0D]">Match Not Found</h1>
          <p className="font-normal text-base text-[#999999]">
            The match you're looking for doesn't exist or has been removed.
          </p>
          <Link
            href="/dashboard/matches"
            className="mt-6 px-6 py-2 bg-[#1D1D1F] text-white rounded-lg hover:bg-[#2D2D2D] transition-colors font-medium text-sm"
          >
            Back to Matches
          </Link>
        </div>
      </div>
    </div>
  );
}
