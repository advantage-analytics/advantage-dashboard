import { FileClock, Video } from "lucide-react";
import { ConfirmNote } from "advantage-analytics-ds";

/** A one-line note in a confirm body — an icon and a sentence on the subtle surface. */
export function Notes() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 392,
      }}
    >
      <ConfirmNote icon={<FileClock />}>
        Your unsaved lineup for Saturday&apos;s dual is discarded.
      </ConfirmNote>
      <ConfirmNote icon={<Video />}>
        The 47-minute film attached to this match is deleted from storage.
      </ConfirmNote>
    </div>
  );
}
