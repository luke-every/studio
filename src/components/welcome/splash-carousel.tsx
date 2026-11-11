"use client";

import { useEffect, useState } from "react";

/** Phones on the ring, 30° apart, so five face the viewer at once. `splash-phone` assumes twelve. */
const COUNT = 12;
/** How many different prototypes the ring shows: as many as face the viewer at once. */
const FACES = 5;

/**
 * A slow ring of phones above the door: the studio's work, turning.
 *
 * Each phone stands on the outside of a cylinder and faces out, so the one in
 * front is flat and full size and the rest turn away and recede. The front
 * phone arrives as the others fan out left and right from behind it, and the
 * ring turns from the start, easing up to speed. Focus follows depth: sharp in front, softening and fading
 * as a phone turns side-on, so nothing pops in at the edges. All of it is CSS
 * (`splash-ring`, `splash-phone` in motion.css).
 *
 * The faces are the feed's pictures of the newest prototypes, repeated round
 * the ring, at the feed tiles' phone proportions. Not every prototype has a
 * picture (it is made a minute after a push, and older versions may have
 * none), so every candidate is tried and the newest five that load are used.
 * They fade in together once that is known; until then, and if none load,
 * the phones are the plain tile colour.
 */
export function SplashCarousel({ pictures }: { pictures: string[] }) {
  const [faces, setFaces] = useState<string[]>([]);

  useEffect(() => {
    let current = true;
    const tried = pictures.map(
      (src) =>
        new Promise<string | null>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(src);
          image.onerror = () => resolve(null);
          image.src = src;
        }),
    );
    void Promise.all(tried).then((loaded) => {
      if (current) setFaces(loaded.filter((src) => src !== null).slice(0, FACES));
    });
    return () => {
      current = false;
    };
  }, [pictures]);

  return (
    <div aria-hidden className="pointer-events-none grid place-items-center [perspective:var(--splash-perspective)]">
      <div className="splash-ring relative aspect-[9/19.5] w-[var(--splash-device-width)]">
        {Array.from({ length: COUNT }, (_, index) => {
          // Steps round the ring from the front: to the left for the first half, to the right for the rest.
          const place = index <= COUNT / 2 ? -index : COUNT - index;
          return (
            <div key={index} style={{ "--i": index, "--s": place, "--d": Math.abs(place) } as React.CSSProperties} className="splash-phone absolute inset-0">
              <div className="size-full overflow-hidden rounded-[var(--r-device)] bg-tile">
                <div
                  data-ready={faces.length > 0 || undefined}
                  style={faces.length > 0 ? { backgroundImage: `url(${JSON.stringify(faces[index % faces.length])})` } : undefined}
                  className="fade-in size-full bg-cover bg-top"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
