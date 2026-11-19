import { z } from "zod";

/**
 * A canvas as it is kept in the cloud: one file per version beside its comments (`canvas/<slug>/<version>.json`), and a picture is a file of its own
 * (`canvas/<slug>/images/<name>.json`, a data address as text), written once and never replaced. `savedAt` is when it was saved, so a copy can tell
 * whether it is behind. What a canvas holds is checked only for its shape here; the canvas itself reads each piece and frame as it always has.
 */
export const canvasDocSchema = z.object({
  savedAt: z.string(),
  by: z.string().optional(),
  canvas: z.object({
    offsets: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
    pieces: z.array(z.record(z.string(), z.unknown())),
    frames: z.array(z.record(z.string(), z.unknown())),
  }),
});
export type CanvasDoc = z.infer<typeof canvasDocSchema>;

/** The name a picture is kept under: what the canvas makes (`piece-ab12cd`), and nothing that could become another path. */
export const IMAGE_NAME = /^[a-z0-9-]{3,40}$/;
/** A picture as a data address: a PNG or JPEG, as large as the canvas ever makes one (it shrinks them to 1600px). */
export const IMAGE_DATA = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/;
export const MAX_IMAGE_CHARS = 4_000_000;
