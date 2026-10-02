/**
 * Where a room keyframe puts the room's visible box on screen: the clip box
 * mapped through the transform, with the transform about the room's top-left
 * corner (`transform-origin: 0 0`, which `RoomKeyframe` carries). Shared by
 * the unit spec (`film-motion.spec.ts`) and the browser spec that records the
 * keyframes the room really animated (`film-playback-refresh.spec.ts`).
 */
export function screenBox(
  kf: { transform: string; clipPath: string },
  room: { width: number; height: number },
) {
  const [, x, y, s] = kf.transform
    .match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/)!
    .map(Number);
  const [, iy, ix, r] = kf.clipPath
    .match(/inset\(([\d.]+)px ([\d.]+)px round ([\d.]+)px\)/)!
    .map(Number);
  return {
    left: x + ix * s,
    top: y + iy * s,
    width: (room.width - 2 * ix) * s,
    height: (room.height - 2 * iy) * s,
    radiusOnScreen: r * s,
  };
}
