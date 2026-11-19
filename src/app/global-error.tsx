"use client";

import NextError from "next/error";
import { useReportBoundaryError } from "@/lib/ui/report-boundary-error";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The same rules as every segment's `error.tsx`: a server throw (`digest`)
  // is already captured by `onRequestError`, and a dropped connection is
  // nothing we can fix.
  useReportBoundaryError(error, "global_error");

  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
