import { snapshot, type CaptureFunction } from "distortion-waves";

const SIDES = ["top", "right", "bottom", "left"] as const;

/**
 * The picture a distortion wave bends, with every border at the width the page gives it.
 *
 * Tailwind's reset gives every element `border: 0 solid`. The library's own picture writes the `solid` (it is not the
 * browser's default) but leaves out the `0px` (it is), and an SVG copy with a style and no width draws `medium`: a
 * 3px frame in the text colour round every box. Writing the widths out keeps the picture the same as the page.
 *
 * Pass it as `capture` on any DistortionWave over Tailwind markup.
 */
export const captureWithBorders: CaptureFunction = async ({ element, width, height, scale, background, ignore }) => {
  const { canvas } = await snapshot(element, {
    width,
    height,
    scale,
    background,
    skip: ignore,
    force: (el) => {
      const cs = getComputedStyle(el);
      if (SIDES.every((side) => cs.getPropertyValue(`border-${side}-style`) === "none")) return undefined;
      return Object.fromEntries(SIDES.map((side) => [`border-${side}-width`, cs.getPropertyValue(`border-${side}-width`)]));
    },
  });
  return canvas;
};
