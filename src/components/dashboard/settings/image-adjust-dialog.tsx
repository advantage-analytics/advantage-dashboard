"use client";

import { useEffect, useRef, useState } from "react";
import { Focus, Minus, Move, Plus } from "lucide-react";
import { RosterDialog } from "@/components/dashboard/team/dialog-shell";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import {
  artworkBounds,
  bakeAdjusted,
  baseScale,
  centredOnArtwork,
  clampZoom,
  decodeImage,
  FRAME_PX,
  type Adjustment,
  type ArtworkBounds,
  type DecodedImage,
} from "@/lib/ui/image-adjust";
import { cn } from "@/lib/utils";

/**
 * Place, zoom and back an image before it becomes a crest or a profile photo.
 *
 * Choosing a file used to upload it as-is, centre-cropped. That is fine for a
 * phone photo and wrong for the file a program actually has — an SVG crest
 * exported with its artwork sitting off to one side of a transparent canvas,
 * which came out tiny, off-centre and on the grey tile. So the file now lands
 * here first: drag to place it, zoom, pick what fills the clear parts, and
 * Save bakes a square that every `<img>` in the product can show unchanged.
 *
 * `shape` is the one thing the two callers differ on — the design system
 * keeps circles for people and rounded squares for programs — and it drives
 * the frame, the previews and the copy. The background row only appears for a
 * file that has anything see-through; a JPG has nothing to fill.
 */
export function ImageAdjustDialog({
  open,
  file,
  shape,
  outputEdge,
  saving,
  onSave,
  onCancel,
  onChooseAnother,
}: {
  open: boolean;
  /** The chosen file. The dialog decodes it itself and frees it on close. */
  file: File | null;
  shape: "square" | "circle";
  /** Edge of the baked square, in px — 512 for both callers today. */
  outputEdge: number;
  saving: boolean;
  onSave: (baked: Blob) => void;
  onCancel: () => void;
  onChooseAnother: () => void;
}) {
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [failed, setFailed] = useState(false);
  const [adjustment, setAdjustment] = useState<Adjustment>(IDENTITY);
  const [dragging, setDragging] = useState(false);
  const [custom, setCustom] = useState("");
  const [baking, setBaking] = useState(false);
  // Found once per decode — the scan draws the image and reads every pixel.
  const [bounds, setBounds] = useState<ArtworkBounds | null>(null);

  // Decode when the file changes; release the previous one.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let decoded: DecodedImage | null = null;
    decodeImage(file).then((result) => {
      if (cancelled) {
        result?.release();
        return;
      }
      decoded = result;
      setFailed(!result);
      setImage(result);
      // A transparent file opens already centred on its artwork — the common
      // case needs no drag at all. Anything else opens as a centre crop.
      const initialBounds = result ? artworkBounds(result) : null;
      setBounds(initialBounds);
      setAdjustment(
        result && initialBounds
          ? centredOnArtwork(result, initialBounds, "#FFFFFF")
          : IDENTITY,
      );
      setCustom("");
    });
    // The file is gone (closed, or replaced): free it and clear the stage so
    // the next open never flashes the last image.
    return () => {
      cancelled = true;
      decoded?.release();
      setImage(null);
      setBounds(null);
      setFailed(false);
    };
  }, [file]);

  const isPhoto = shape === "circle";
  const showBackground = !isPhoto && image?.hasAlpha === true;
  const zoomPct = Math.round(adjustment.zoom * 100);
  const guides = dragging && isCentred(image, bounds, adjustment);

  const place = (patch: Partial<Adjustment>) =>
    setAdjustment((current) => ({ ...current, ...patch }));

  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  );

  const save = async () => {
    if (!image) return;
    setBaking(true);
    const baked = await bakeAdjusted(image, adjustment, outputEdge);
    setBaking(false);
    if (baked) onSave(baked);
    else setFailed(true);
  };

  const centre = () => {
    if (!image) return;
    if (bounds) place(centredOnArtwork(image, bounds, adjustment.fill));
    else place({ tx: 0, ty: 0, zoom: 1 });
  };

  return (
    <RosterDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      width={520}
      title={isPhoto ? "Adjust your photo" : "Adjust the crest"}
      description={
        isPhoto
          ? "Drag to place your face in the circle. This is exactly how it shows on your profile and in the header."
          : "Drag to place it inside the square. This is exactly how it shows on match cards, the roster and shared reports."
      }
      footer={
        <>
          <button
            type="button"
            onClick={onChooseAnother}
            disabled={saving || baking}
            className="cursor-pointer text-[12px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)] focus-visible:outline-none disabled:opacity-50"
          >
            {isPhoto ? "Choose another photo" : "Choose another file"}
          </button>
          <span className="flex-1" />
          <SettingsButton
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={saving || baking}
          >
            Cancel
          </SettingsButton>
          <SettingsButton
            size="sm"
            onClick={save}
            disabled={!image}
            loading={saving || baking}
          >
            {isPhoto ? "Save photo" : "Save crest"}
          </SettingsButton>
        </>
      }
    >
      {failed && (
        <p
          role="alert"
          className="rounded-[var(--radius-button)] px-3 py-2 text-[12px] text-[var(--danger)]"
          style={{ background: "var(--danger-tint, rgba(229,24,55,0.08))" }}
        >
          Couldn&apos;t read that image. Use a PNG, JPG, WebP
          {isPhoto ? "" : " or SVG"}.
        </p>
      )}

      {/* The stage: a 472×288 well with the frame in the middle. Pointer
          capture keeps a fast drag from escaping the well. */}
      <div
        role="img"
        tabIndex={0}
        aria-label="Image position. Drag, or use the arrow keys."
        onPointerDown={(event) => {
          if (!image) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            tx: adjustment.tx,
            ty: adjustment.ty,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || !image) return;
          let tx = start.tx + (event.clientX - start.x);
          let ty = start.ty + (event.clientY - start.y);
          // Snap the artwork's centre onto the frame's within 4px.
          const offset = artworkOffset(image, bounds, {
            ...adjustment,
            tx,
            ty,
          });
          if (offset && Math.abs(offset.x) < 4) tx -= offset.x;
          if (offset && Math.abs(offset.y) < 4) ty -= offset.y;
          place({ tx, ty });
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          const step = event.shiftKey ? 10 : 1;
          const delta = ARROWS[event.key];
          if (!delta) return;
          event.preventDefault();
          place({
            tx: adjustment.tx + delta[0] * step,
            ty: adjustment.ty + delta[1] * step,
          });
        }}
        className={cn(
          "relative h-[288px] w-full touch-none overflow-hidden rounded-[8px] bg-[var(--surface-subtle)] select-none focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
          image ? (dragging ? "cursor-grabbing" : "cursor-grab") : "",
        )}
      >
        <div
          className="absolute"
          style={{
            left: `calc(50% - ${FRAME_PX / 2}px)`,
            top: 34,
            width: FRAME_PX,
            height: FRAME_PX,
          }}
        >
          <Composite image={image} adjustment={adjustment} size={FRAME_PX} />
        </div>
        {/* The mask: everything outside the frame dims, and the frame's own
            shape is the shadow's hole, so a circle reads as a circle. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: `calc(50% - ${FRAME_PX / 2}px)`,
            top: 34,
            width: FRAME_PX,
            height: FRAME_PX,
            borderRadius: isPhoto ? 9999 : 34,
            boxShadow:
              "0 0 0 1px rgba(0,0,0,0.1), 0 0 0 600px rgba(245,245,245,0.82)",
          }}
        />
        {guides && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute w-px bg-[var(--blue)] opacity-55"
              style={{ left: "calc(50% - 0.5px)", top: 34, height: FRAME_PX }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute h-px bg-[var(--blue)] opacity-55"
              style={{
                left: `calc(50% - ${FRAME_PX / 2}px)`,
                top: 34 + FRAME_PX / 2,
                width: FRAME_PX,
              }}
            />
          </>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center">
          <span className="flex items-center gap-[5px] text-[11px] text-[var(--ink-600)]">
            <Move className="size-3" strokeWidth={1.5} aria-hidden="true" />
            {guides ? "Centered" : "Drag to reposition"}
          </span>
        </div>
      </div>

      {/* Zoom, and the one button that does the trimming. */}
      <div className="flex items-center gap-2">
        <StepButton
          label="Zoom out"
          onClick={() => place({ zoom: clampZoom(adjustment.zoom - 0.1) })}
        >
          <Minus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        </StepButton>
        <input
          type="range"
          aria-label="Zoom"
          min={40}
          max={300}
          step={1}
          value={zoomPct}
          disabled={!image}
          onChange={(event) =>
            place({ zoom: clampZoom(Number(event.target.value) / 100) })
          }
          className="adjust-zoom flex-1"
        />
        <StepButton
          label="Zoom in"
          onClick={() => place({ zoom: clampZoom(adjustment.zoom + 0.1) })}
        >
          <Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        </StepButton>
        <span className="mono w-10 shrink-0 text-right text-[12px] text-[var(--ink-700)]">
          {zoomPct}%
        </span>
        <span className="mx-1.5 h-[18px] w-px shrink-0 bg-[var(--border-hairline)]" />
        <SettingsButton
          variant="outline"
          size="sm"
          onClick={centre}
          disabled={!image}
        >
          <Focus className="size-[13px]" strokeWidth={1.5} aria-hidden="true" />
          {bounds ? "Center artwork" : "Reset"}
        </SettingsButton>
      </div>

      {showBackground && (
        <div className="flex min-h-10 items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-[13px] font-medium text-[var(--ink-900)]">
              Background
            </span>
            <span className="text-[11px] text-[var(--ink-500)]">
              Fills the transparent parts of your{" "}
              {file?.type === "image/svg+xml" ? "SVG" : "image"}.
            </span>
          </div>
          <div
            role="radiogroup"
            aria-label="Background"
            className="flex items-center gap-2.5"
          >
            {SWATCHES.map((swatch) => (
              <Swatch
                key={swatch.value}
                label={swatch.label}
                color={swatch.value}
                checked={custom === "" && adjustment.fill === swatch.value}
                onPick={() => {
                  setCustom("");
                  place({ fill: swatch.value });
                }}
              />
            ))}
            <Swatch
              label="Custom color"
              color="#FFFFFF"
              checked={custom !== ""}
              onPick={() => {
                if (custom === "") setCustom(adjustment.fill);
              }}
            >
              <Plus
                className="size-3 text-[var(--ink-600)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </Swatch>
            {custom !== "" && (
              <div className="ml-1 flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-3.5 rounded-[4px] border border-[var(--border-subtle)]"
                  style={{ background: adjustment.fill }}
                />
                <input
                  aria-label="Custom background hex"
                  value={custom}
                  maxLength={7}
                  onChange={(event) => {
                    let next = event.target.value.trim();
                    if (next && next[0] !== "#") next = `#${next}`;
                    setCustom(next);
                    if (/^#[0-9a-fA-F]{6}$/.test(next)) place({ fill: next });
                  }}
                  className="mono h-[26px] w-16 border-b border-[var(--border-field)] bg-transparent text-[12px] text-[var(--ink-900)] focus:border-b-2 focus:border-[var(--blue)] focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Where it ends up, at the sizes it ends up at. */}
      <div className="flex flex-col gap-2.5 border-t border-[var(--border-hairline)] pt-3.5">
        <span className="text-[11px] text-[var(--ink-600)]">Preview</span>
        <div className="flex items-center gap-5">
          <PreviewTile
            image={image}
            adjustment={adjustment}
            size={isPhoto ? 80 : 52}
            circle={isPhoto}
          />
          <div className="flex min-w-0 items-center gap-2.5 border-l border-[var(--border-hairline)] pl-5">
            <PreviewTile
              image={image}
              adjustment={adjustment}
              size={isPhoto ? 28 : 38}
              circle={isPhoto}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="h-[13px] w-28 rounded-[3px] bg-[var(--ink-100)]" />
              <span className="mt-[3px] h-[11px] w-20 rounded-[3px] bg-[var(--ink-100)]" />
            </div>
          </div>
        </div>
      </div>

      <style>{ZOOM_CSS}</style>
    </RosterDialog>
  );
}

const IDENTITY: Adjustment = { tx: 0, ty: 0, zoom: 1, fill: "#FFFFFF" };

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const SWATCHES = [
  { label: "White", value: "#FFFFFF" },
  { label: "Light grey", value: "#F5F5F5" },
  { label: "Ink", value: "#0D0D0D" },
];

/** Where the artwork's centre sits relative to the frame's, in frame px. */
function artworkOffset(
  image: DecodedImage,
  bounds: ArtworkBounds | null,
  adjustment: Adjustment,
): { x: number; y: number } | null {
  const k = baseScale(image) * adjustment.zoom;
  const cx = bounds ? bounds.x + bounds.width / 2 - image.width / 2 : 0;
  const cy = bounds ? bounds.y + bounds.height / 2 - image.height / 2 : 0;
  return { x: adjustment.tx + cx * k, y: adjustment.ty + cy * k };
}

function isCentred(
  image: DecodedImage | null,
  bounds: ArtworkBounds | null,
  adjustment: Adjustment,
) {
  if (!image) return false;
  const offset = artworkOffset(image, bounds, adjustment);
  return !!offset && Math.abs(offset.x) < 0.5 && Math.abs(offset.y) < 0.5;
}

/**
 * The image under its adjustment, in a `size`-px box. The stage and the
 * previews are the same composite at different sizes, so they cannot drift.
 */
function Composite({
  image,
  adjustment,
  size,
}: {
  image: DecodedImage | null;
  adjustment: Adjustment;
  size: number;
}) {
  const k = size / FRAME_PX;
  const scale = image ? baseScale(image) * adjustment.zoom * k : 1;
  return (
    <div
      className="relative overflow-hidden"
      style={{ width: size, height: size, background: adjustment.fill }}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL being positioned live
        <img
          src={image.source.src}
          alt=""
          draggable={false}
          className="absolute max-w-none"
          style={{
            width: image.width * scale,
            height: image.height * scale,
            left: size / 2 + adjustment.tx * k - (image.width * scale) / 2,
            top: size / 2 + adjustment.ty * k - (image.height * scale) / 2,
          }}
        />
      )}
    </div>
  );
}

function PreviewTile({
  image,
  adjustment,
  size,
  circle,
}: {
  image: DecodedImage | null;
  adjustment: Adjustment;
  size: number;
  circle: boolean;
}) {
  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: circle ? 9999 : 8,
        // A white crest on a white card needs its edge drawn, or it has none.
        boxShadow:
          adjustment.fill.toUpperCase() === "#FFFFFF"
            ? "inset 0 0 0 1px var(--border-hairline)"
            : "none",
      }}
    >
      <Composite image={image} adjustment={adjustment} size={size} />
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function Swatch({
  label,
  color,
  checked,
  onPick,
  children,
}: {
  label: string;
  color: string;
  checked: boolean;
  onPick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onPick}
      className="flex size-6 cursor-pointer items-center justify-center rounded-full border transition-shadow duration-200 focus-visible:outline-none"
      style={{
        background: color,
        borderColor: color === "#0D0D0D" ? "#0D0D0D" : "var(--border-field)",
        boxShadow: checked
          ? "0 0 0 2px var(--surface-card), 0 0 0 3.5px var(--blue)"
          : "none",
      }}
    >
      {children}
    </button>
  );
}

/** The range input, drawn as a hairline track with a 14px thumb. */
const ZOOM_CSS = `
.adjust-zoom { -webkit-appearance: none; appearance: none; height: 20px; margin: 0; background: transparent; cursor: pointer; }
.adjust-zoom:disabled { cursor: default; opacity: 0.5; }
.adjust-zoom::-webkit-slider-runnable-track { height: 2px; border-radius: 2px; background: var(--border-field); }
.adjust-zoom::-moz-range-track { height: 2px; border-radius: 2px; background: var(--border-field); }
.adjust-zoom::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -6px; border-radius: 999px; background: var(--surface-card); border: 1px solid var(--ink-300); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.adjust-zoom::-moz-range-thumb { width: 14px; height: 14px; border-radius: 999px; background: var(--surface-card); border: 1px solid var(--ink-300); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.adjust-zoom:focus-visible { outline: none; }
.adjust-zoom:focus-visible::-webkit-slider-thumb { box-shadow: var(--focus-ring); border-color: var(--blue); }
`;
