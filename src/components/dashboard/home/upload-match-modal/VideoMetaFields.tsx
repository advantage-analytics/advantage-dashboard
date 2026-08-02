"use client";

/**
 * VideoMetaFields — the two questions only a video upload needs.
 *
 * Rendered above DetailsContent on the Match step for processing providers.
 * Kept separate so DetailsContent stays untouched and shared with the file
 * import flow.
 */

import { memo } from "react";
import { ArrowDown, ArrowUp, Video, VideoOff } from "lucide-react";
import type { FormData } from "./types";
import { eyebrowLabelCls } from "./styles";

export interface VideoMetaFieldsProps {
  formData: FormData;
  onInputChange: (
    field: keyof FormData,
    value: string | number | boolean | undefined
  ) => void;
}

/**
 * Two-option segmented control.
 *
 * A binary with real consequences deserves to be visible at rest rather than
 * hidden behind a select — especially the end question, which silently
 * mis-attributes every statistic when answered wrong.
 */
function ChoicePair<T extends string | boolean>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon: React.ReactNode }[];
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-2 rounded-[10px] border px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 ${
              selected
                ? "border-[#3B82F6] bg-[#EFF4FF]"
                : "border-[#F3F3F3] bg-white hover:border-[#E5E5EA] hover:bg-[#FAFAFA]"
            }`}
          >
            <span className={selected ? "text-[#3B82F6]" : "text-[#AAAAAA]"}>
              {option.icon}
            </span>
            <span
              className={`text-[13px] ${
                selected ? "font-medium text-[#0D0D0D]" : "text-[#525252]"
              }`}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Hoisted: fully static, so they don't need rebuilding on every keystroke that
// re-renders the match step.
const END_OPTIONS = [
  {
    value: true,
    label: "Top of frame",
    icon: <ArrowUp className="size-3.5" strokeWidth={1.5} />,
  },
  {
    value: false,
    label: "Bottom of frame",
    icon: <ArrowDown className="size-3.5" strokeWidth={1.5} />,
  },
];

const CAMERA_OPTIONS = [
  {
    value: true,
    label: "Fixed position",
    icon: <Video className="size-3.5" strokeWidth={1.5} />,
  },
  {
    value: false,
    label: "Moved or panned",
    icon: <VideoOff className="size-3.5" strokeWidth={1.5} />,
  },
];

function VideoMetaFieldsImpl({ formData, onInputChange }: VideoMetaFieldsProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className={eyebrowLabelCls}>Your end at video start</span>
        </div>
        <ChoicePair<boolean>
          ariaLabel="Which end you were on when the video starts"
          value={formData.initialTopPlayerIsPlayer1}
          onChange={(v) => onInputChange("initialTopPlayerIsPlayer1", v)}
          options={END_OPTIONS}
        />
        <p className="text-[12px] leading-[1.5] text-[#888888]">
          Where you were standing when the video begins — not where you served from
          first. Ends change through the match; we only need the opening.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className={eyebrowLabelCls}>Camera</span>
        <ChoicePair<boolean>
          ariaLabel="Whether the camera stayed in one position"
          value={formData.fixedCamera}
          onChange={(v) => onInputChange("fixedCamera", v)}
          options={CAMERA_OPTIONS}
        />
        <p className="text-[12px] leading-[1.5] text-[#888888]">
          A tripod or a phone propped against the fence is fixed. Handheld or
          following the play is not.
        </p>
      </div>
    </div>
  );
}

export const VideoMetaFields = memo(VideoMetaFieldsImpl);
