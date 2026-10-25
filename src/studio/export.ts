// A ZIP writer for stored PNG entries (no dependency, no remote capture service).
export function storedZip(files: { name: string; bytes: Uint8Array }[]) {
  const chunks: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const n of b) {
      c ^= n;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const f of files) {
    const name = new TextEncoder().encode(f.name),
      sum = crc(f.bytes),
      h = new Uint8Array(30 + name.length),
      v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, sum, true);
    v.setUint32(18, f.bytes.length, true);
    v.setUint32(22, f.bytes.length, true);
    v.setUint16(26, name.length, true);
    h.set(name, 30);
    const c = new Uint8Array(46 + name.length),
      w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x800, true);
    w.setUint32(16, sum, true);
    w.setUint32(20, f.bytes.length, true);
    w.setUint32(24, f.bytes.length, true);
    w.setUint16(28, name.length, true);
    w.setUint32(42, offset, true);
    c.set(name, 46);
    central.push(c);
    chunks.push(h, f.bytes);
    offset += h.length + f.bytes.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0),
    end = new Uint8Array(22),
    v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, files.length, true);
  v.setUint16(10, files.length, true);
  v.setUint32(12, size, true);
  v.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end] as BlobPart[], {
    type: "application/zip",
  });
}
export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function captureElement(root: HTMLElement): Promise<Uint8Array> {
  await root.ownerDocument.fonts.ready;
  const clone = root.cloneNode(true) as HTMLElement,
    source = [root, ...root.querySelectorAll("*")],
    target = [clone, ...clone.querySelectorAll("*")];
  for (let i = 0; i < source.length; i++) {
    const from = source[i] as HTMLElement,
      to = target[i] as HTMLElement,
      style = from.ownerDocument.defaultView!.getComputedStyle(from);
    to.setAttribute(
      "style",
      Array.from(style)
        .map((k) => `${k}:${style.getPropertyValue(k)}`)
        .join(";"),
    );
    to.removeAttribute("id");
    to.style.animation = "none";
    to.style.transition = "none";
    if (from.tagName.toLowerCase() === "img") {
      const picture = from as HTMLImageElement;
      if (!picture.complete) await picture.decode();
      if (picture.src.startsWith("data:")) to.setAttribute("src", picture.src);
      else {
        const r = await fetch(picture.src, { credentials: "omit" });
        if (!r.ok) throw Error("commercial_export_image_unavailable");
        const blob = await r.blob();
        to.setAttribute(
          "src",
          await new Promise<string>((ok, no) => {
            const reader = new FileReader();
            reader.onload = () => ok(String(reader.result));
            reader.onerror = no;
            reader.readAsDataURL(blob);
          }),
        );
      }
      to.removeAttribute("loading");
      to.removeAttribute("srcset");
    }
  }
  const width = Math.ceil(root.getBoundingClientRect().width),
    height = Math.ceil(root.scrollHeight);
  if (width * height > 24000000 || height > 16000)
    throw Error("commercial_export_too_large");
  clone.style.margin = "0";
  clone.style.width = width + "px";
  clone.style.height = height + "px";
  const xml = new XMLSerializer().serializeToString(clone),
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
  const image = new Image();
  image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await image.decode();
  const scale = Math.min(2, Math.sqrt(24000000 / (width * height))),
    canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil((height + 32) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("commercial_export_unavailable");
  ctx.scale(scale, scale);
  ctx.fillStyle =
    root.ownerDocument.defaultView!.getComputedStyle(root).backgroundColor ||
    "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = "#f0f5f5";
  ctx.fillRect(0, height, width, 32);
  ctx.fillStyle = "#27474a";
  ctx.font = "11px Arial";
  ctx.fillText(
    "Prévia comercial · conteúdo sujeito à revisão",
    12,
    height + 20,
  );
  const blob = await new Promise<Blob>((ok, no) =>
    canvas.toBlob(
      (b) => (b ? ok(b) : no(Error("commercial_export_unavailable"))),
      "image/png",
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
