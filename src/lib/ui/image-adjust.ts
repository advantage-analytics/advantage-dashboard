/**
 * Geometry and pixel work behind the image-adjust dialog — decoding a chosen
 * file, finding where its artwork actually sits, and baking the framed result
 * to a square upload. Browser-only: it draws to canvases.
 *
 * The one idea everything hangs on: at zoom 1 the image is scaled so its
 * shorter side fills the frame (`baseScale`), and the adjustment is a pixel
 * offset of the image's centre from the frame's centre plus a zoom on top.
 * The stage, the previews and the bake all draw from that same triple, so
 * what the person sees at 220px is what ships at 512px.
 */

export type Adjustment = {
  /** Image centre relative to frame centre, in frame px at the stage's size. */
  tx: number;
  ty: number;
  /** 1 = the shorter side fills the frame. */
  zoom: number;
  /** CSS colour painted under the image — matters for transparent files. */
  fill: string;
};

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 3;

/** The frame's edge on the stage. Every offset is expressed against it. */
export const FRAME_PX = 220;

export type DecodedImage = {
  source: HTMLImageElement;
  width: number;
  height: number;
  /** True when some pixel is see-through — the background choice matters. */
  hasAlpha: boolean;
  /** Revokes the object URL behind `source`. */
  release: () => void;
};

/** The largest opaque region, in image px — what "Center artwork" centres on. */
export type ArtworkBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export function baseScale(image: { width: number; height: number }): number {
  return FRAME_PX / Math.min(image.width, image.height);
}

/**
 * Decode a chosen file into something a canvas can draw. Null when the
 * browser cannot read it — HEIC outside Safari, a renamed PDF.
 *
 * SVGs come through `<img>` rather than `createImageBitmap`, which refuses an
 * SVG with no intrinsic size. One without `width`/`height` attributes still
 * reports 0×0 through `<img>`, so the file is re-written with the viewBox's
 * dimensions before a second attempt.
 */
/**
 * The image already on file, as a `File` the adjust dialog can open — "Adjust"
 * re-places the saved photo or crest rather than asking for it again. Throws
 * when the fetch fails; the caller says so in its own words.
 */
export async function fetchImageFile(url: string, name: string): Promise<File> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type });
}

export async function decodeImage(file: File): Promise<DecodedImage | null> {
  let blob: Blob = file;
  let decoded = await loadImage(blob);
  if (decoded && decoded.naturalWidth === 0 && file.type === "image/svg+xml") {
    const sized = await sizeSvgFromViewBox(file);
    if (sized) {
      blob = sized;
      decoded = await loadImage(blob);
    }
  }
  if (!decoded || decoded.naturalWidth === 0 || decoded.naturalHeight === 0) {
    return null;
  }
  const source = decoded;
  const width = source.naturalWidth;
  const height = source.naturalHeight;
  const hasAlpha =
    file.type === "image/svg+xml" ||
    (file.type !== "image/jpeg" && sampleHasAlpha(source, width, height));
  return {
    source,
    width,
    height,
    hasAlpha,
    release: () => URL.revokeObjectURL(source.src),
  };
}

function loadImage(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

async function sizeSvgFromViewBox(file: File): Promise<Blob | null> {
  const text = await file.text();
  const match = text.match(
    /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i,
  );
  if (!match) return null;
  const width = Number(match[3]);
  const height = Number(match[4]);
  if (!(width > 0 && height > 0)) return null;
  const sized = text.replace(
    /<svg\b/i,
    `<svg width="${width}" height="${height}"`,
  );
  return new Blob([sized], { type: "image/svg+xml" });
}

/** Draw a small copy and look for any pixel that is not fully opaque. */
function sampleHasAlpha(
  source: CanvasImageSource,
  width: number,
  height: number,
): boolean {
  const data = sampleAlpha(source, width, height, 64);
  if (!data) return false;
  for (let i = 3; i < data.data.length; i += 4) {
    if (data.data[i] < 255) return true;
  }
  return false;
}

function sampleAlpha(
  source: CanvasImageSource,
  width: number,
  height: number,
  edge: number,
): ImageData | null {
  const scale = edge / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, w, h);
  try {
    return context.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}

/**
 * The bounding box of the pixels that are actually drawn, in image px. An SVG
 * exported with its artwork off to one side of its own canvas is the whole
 * reason the dialog exists; centring the file would not centre the crest.
 * Null when the image is fully opaque or fully empty — nothing to trim.
 */
export function artworkBounds(image: DecodedImage): ArtworkBounds | null {
  if (!image.hasAlpha) return null;
  const edge = 256;
  const data = sampleAlpha(image.source, image.width, image.height, edge);
  if (!data) return null;
  let minX = data.width;
  let minY = data.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      // Anything above faint anti-aliasing counts as artwork.
      if (data.data[(y * data.width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const k = image.width / data.width;
  return {
    x: minX * k,
    y: minY * k,
    width: (maxX - minX + 1) * k,
    height: (maxY - minY + 1) * k,
  };
}

/**
 * The adjustment that puts the artwork in the middle of the frame with a
 * little air around it — 72% of the edge, so a crest reads as a mark on a
 * tile rather than as a tile.
 */
export function centredOnArtwork(
  image: DecodedImage,
  bounds: ArtworkBounds,
  fill: string,
): Adjustment {
  const base = baseScale(image);
  const longest = Math.max(bounds.width, bounds.height) * base;
  const zoom = clampZoom((FRAME_PX * 0.72) / longest);
  const cx = bounds.x + bounds.width / 2 - image.width / 2;
  const cy = bounds.y + bounds.height / 2 - image.height / 2;
  return {
    tx: -cx * base * zoom,
    ty: -cy * base * zoom,
    zoom,
    fill,
  };
}

/**
 * Render the framed image to a square of `edge` px. What comes back is what
 * every `<img>` in the product shows, so the fill is painted first even for
 * an opaque photo — a zoomed-out photo's corners are the fill, not nothing.
 * Null when the canvas cannot encode (a tainted source, a memory failure).
 */
export async function bakeAdjusted(
  image: DecodedImage,
  adjustment: Adjustment,
  edge: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const k = edge / FRAME_PX;
  const scale = baseScale(image) * adjustment.zoom * k;
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  context.fillStyle = adjustment.fill;
  context.fillRect(0, 0, edge, edge);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image.source,
    edge / 2 + adjustment.tx * k - drawW / 2,
    edge / 2 + adjustment.ty * k - drawH / 2,
    drawW,
    drawH,
  );
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
}
