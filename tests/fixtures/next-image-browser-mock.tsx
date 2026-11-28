/* eslint-disable @next/next/no-img-element */
// `next/image` for a browser harness: a plain <img>, since the harness has
// no image optimiser behind it.
export default function Image({
  src,
  alt,
  width,
  height,
  style,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  priority?: boolean;
}) {
  return (
    <img src={src} alt={alt} width={width} height={height} style={style} />
  );
}
