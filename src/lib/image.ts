/**
 * Pictures in the browser: the one place a picture is shrunk, re-encoded or read as a data address, so a canvas picture, a
 * picture swapped in the edit panel and (next) an exported asset all go the same way.
 *
 * `encodeImage` is the primitive: any picture to a blob, at most so big and so long. `fitImage` is the policy for what is
 * sent to the studio: leave it alone unless it is over the limit.
 */

/** The most the studio keeps of one uploaded picture. The server checks the same number (and Vercel's own body limit sits above it). */
export const IMAGE_MAX_BYTES = 4_000_000;

type Format = "image/png" | "image/jpeg" | "image/webp";
export type EncodeOptions = {
  /** The longest side it may have, in pixels; larger is scaled down, smaller is left (unless `enlarge`). */
  maxSide?: number;
  /** Make it exactly `maxSide` on its longest side even when it has fewer pixels, as an export at 2× of a 1× picture does. */
  enlarge?: boolean;
  maxBytes?: number;
  /** One format and nothing else, as it comes. Absent: a PNG stays a PNG while it fits (so its transparency does), then WebP, then JPEG. */
  type?: Format;
  quality?: number;
};
export type Encoded = { blob: Blob; width: number; height: number; /** The picture's own size, before any scaling: what a layer made from it is sized by. */ sourceWidth: number; sourceHeight: number };

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const SHRINKS = 4;

/** A picture as a blob in a format, scaled by `scale`. A browser that can't write the format says so by handing back another type. */
export async function encodeImage(source: Blob, { maxSide = 2048, enlarge = false, maxBytes = IMAGE_MAX_BYTES, type, quality = 0.85 }: EncodeOptions = {}): Promise<Encoded> {
  const bitmap = await createImageBitmap(source);
  try {
    const formats: Format[] = type ? [type] : [...(source.type === "image/png" ? (["image/png"] as const) : []), "image/webp", "image/jpeg"];
    const fit = maxSide / Math.max(bitmap.width, bitmap.height);
    let scale = enlarge ? fit : Math.min(1, fit);
    for (let pass = 0; pass < SHRINKS; pass++, scale *= 0.75) {
      const [width, height] = [Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale))];
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context) context.imageSmoothingQuality = "high";
      context?.drawImage(bitmap, 0, 0, width, height);
      for (const format of formats) {
        // JPEG has no transparency: what there is goes onto white rather than black.
        if (format === "image/jpeg" && context) {
          context.globalCompositeOperation = "destination-over";
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
        }
        for (const step of format === "image/png" ? [1] : [1, 0.8, 0.65]) {
          const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, format, quality * step));
          // Asked for one format and got whatever the browser could make (Safari has no WebP): fine. Free to choose: that one is skipped.
          if (blob && (type || blob.type === format) && blob.size <= maxBytes) return { blob, width, height, sourceWidth: bitmap.width, sourceHeight: bitmap.height };
        }
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error("That picture is too large to keep.");
}

/**
 * A picture to send: as it is when it is small enough, and always when shrinking would spoil it (a vector, an animation).
 * Otherwise shrunk until it fits. One that can't be, comes back as it was, for the server to say how large it may be.
 */
export async function fitImage(file: File, options?: EncodeOptions): Promise<File> {
  if (file.size <= (options?.maxBytes ?? IMAGE_MAX_BYTES) || /^image\/(svg\+xml|gif)$/.test(file.type)) return file;
  try {
    const { blob } = await encodeImage(file, options);
    const name = file.name.replace(/\.[^.]*$/, "");
    return new File([blob], `${name}.${EXTENSIONS[blob.type] ?? "png"}`, { type: blob.type });
  } catch {
    return file;
  }
}

/** A blob as a data address. */
export function dataUrlOf(blob: Blob) {
  return new Promise<string>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });
}
