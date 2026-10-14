import type { CSSProperties } from "react";

/**
 * What the skeleton is the shape of: a code's three corner marks and a scatter
 * of modules, drawn once as a mask. 21 modules a side, like a short address's code.
 */
const SKELETON_MASK = (() => {
  const n = 21;
  const corner = (x: number, y: number) =>
    `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  let modules = "";
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const inCorner = (row < 8 && col < 8) || (row < 8 && col > 12) || (row > 12 && col < 8);
      if (!inCorner && (row * 7 + col * 13 + row * col) % 3 === 0) modules += `M${col} ${row}h1v1h-1z`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"><path fill-rule="evenodd" d="${corner(0, 0)}${corner(14, 0)}${corner(0, 14)}${modules}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

/** A code's shape in a shimmer, for the moment before the real one is known. Static, so it is there the instant the box is. */
export function QrSkeleton() {
  const mask: CSSProperties = { maskImage: SKELETON_MASK, WebkitMaskImage: SKELETON_MASK };
  return (
    <div
      aria-hidden
      style={mask}
      className="shimmer absolute inset-0 [--shimmer-base:var(--qr-skeleton)] [--shimmer-shine:var(--qr-skeleton-shine)] [mask-size:100%_100%]"
    />
  );
}
