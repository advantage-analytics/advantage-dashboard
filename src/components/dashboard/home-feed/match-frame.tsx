import { MatchThumbnail } from "@/components/dashboard/shared/match-thumbnail";
import { cn } from "@/lib/utils";
import { START_ART } from "./start-cards";

/** The box, and the pixels the image inside it is laid out at. */
const SIZES = {
  row: { box: "h-[44px] w-[78px] rounded-[6px]", width: 78, height: 44 },
} as const;

/**
 * A 16:9 still from a match's video.
 *
 * The still is a stored image (`matches.video_thumbnail_key`), signed by the
 * server loader and handed in as `src` — a plain lazy `<img>`, so a list of
 * rows opens no video and asks this app nothing. A match with no still (a
 * SwingVision import with no recording, or a video whose frame was never
 * captured), or one whose image fails to load, shows the court drawing in the
 * same box.
 */
export function MatchFrame({
  src,
  size = "row",
}: {
  /** The signed image URL, or null/undefined for a match with no still. */
  src: string | null | undefined;
  size?: keyof typeof SIZES;
}) {
  const { box, width, height } = SIZES[size];
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden bg-[var(--surface-subtle)]",
        box,
      )}
    >
      {/* Always underneath: what the box shows while the image is on its
          way, and all it shows when there is none or it fails. */}
      <span
        aria-hidden
        className="absolute inset-0 grid place-items-center [&>svg]:h-auto [&>svg]:w-[58%]"
      >
        {START_ART.court}
      </span>
      <MatchThumbnail
        src={src}
        width={width}
        height={height}
        className="pointer-events-none absolute inset-0 size-full"
        fallback={null}
      />
    </span>
  );
}
