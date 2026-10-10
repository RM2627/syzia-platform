// A single source rectangle drives both preview and canvas export.
export function framingRect(
  width: number,
  height: number,
  ratio: number,
  zoom: number,
  x: number,
  y: number,
) {
  const scale = Math.max(1, Math.min(3, zoom));
  const w = Math.min(width, height * ratio) / scale;
  const h = w / ratio;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return {
    x: (width - w) * clamp(x),
    y: (height - h) * clamp(y),
    width: w,
    height: h,
  };
}
