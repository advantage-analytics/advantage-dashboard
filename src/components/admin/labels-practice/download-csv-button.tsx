"use client";

import { Download } from "lucide-react";
import { toCsv } from "@/lib/services/labels/practice-grading";
import { advButton } from "@/lib/ui/adv-button";

/**
 * Saves `rows` as a CSV file in the browser. The rows are already on the
 * page (the server built them for the table), so there is no export route to
 * gate: what the admin can see is what they download.
 */
export function DownloadCsvButton({
  filename,
  rows,
  label = "Download CSV",
  disabled,
}: {
  filename: string;
  rows: readonly (readonly (string | number | null)[])[];
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={advButton("outline", "sm")}
      onClick={() => {
        const blob = new Blob([toCsv(rows)], {
          type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        // Attached and revoked a beat later: Safari and older Firefox cancel
        // a download whose URL is revoked before it starts.
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      <Download className="size-[14px]" strokeWidth={1.5} aria-hidden />
      {label}
    </button>
  );
}
