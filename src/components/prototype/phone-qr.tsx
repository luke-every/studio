"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import qrcode from "qrcode-generator";

import { reviewToken } from "@/lib/registry/actions";

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

/** How often the prototype's address is looked at again. */
const POLL_MS = 500;

/**
 * A QR code for the prototype itself, bottom right of the preview: its own
 * address outside the studio, so a phone with a camera opens the real thing,
 * on the version, controls and variant on screen and wherever you have
 * navigated to inside it. Only the address travels, so what is open on top
 * (a sheet, typed text) doesn't.
 *
 * The address carries a review token, which is what lets that phone leave
 * comments: press and hold on the prototype. The same address without the
 * token, shared with anyone, is the prototype and nothing more.
 *
 * Read from the frame on the client, so the page stays prerendered. The frame
 * is same-origin; a prototype that changes page without loading one (its own
 * routing) fires nothing to listen for, so its address is looked at twice a
 * second. Hidden on a phone, which has no use for it.
 *
 * Until the first address is known the tile holds a skeleton; when the address
 * changes (another variant) the new code fades in over the old one, which is
 * then dropped.
 */
export function PhoneQr({ stage }: { stage: RefObject<HTMLElement | null> }) {
  // The code on show, and while one is fading in, the one it is replacing beneath it.
  const [shown, setShown] = useState<string[]>([]);
  const tokens = useRef(new Map<string, string>());
  const latest = useRef("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = () => {
      // Nothing to update while the tab is hidden or the code is (display: none on a phone).
      if (document.hidden || !box.current?.offsetParent) return;
      try {
        const now = stage.current?.querySelector("iframe")?.contentWindow?.location.href;
        // Until a frame has loaded, keep what was there.
        if (!now || now === "about:blank" || now === latest.current) return;
        latest.current = now;
        void withToken(now, tokens.current).then((href) => {
          if (latest.current === now) setShown((was) => (was.at(-1) === href ? was : [...was.slice(-1), href]));
        });
      } catch {
        // Not readable: keep what was there.
      }
    };
    read();
    const timer = setInterval(read, POLL_MS);
    document.addEventListener("visibilitychange", read);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, [stage]);

  return (
    <div ref={box} className="absolute bottom-10 right-10 z-[var(--z-raised)] hidden rounded-[var(--r-control)] border border-border bg-[var(--qr-bg)] p-2 sm:block">
      <div className="relative size-20 text-[var(--qr-fg)]">
        {shown.length ? null : <div
            aria-hidden
            style={{ maskImage: SKELETON_MASK, WebkitMaskImage: SKELETON_MASK }}
            className="shimmer absolute inset-0 [--shimmer-base:var(--qr-skeleton)] [--shimmer-shine:var(--qr-skeleton-shine)] [mask-size:100%_100%]"
          />}
        {shown.map((href) => (
          <Code key={href} href={href} onArrived={() => setShown((was) => was.slice(-1))} />
        ))}
      </div>
    </div>
  );
}

/** The address with a review token on it, which is asked for once per version. Without one (the studio is locked, or it isn't a prototype's address) it stays as it was. */
export async function withToken(href: string, cache: Map<string, string>) {
  const url = new URL(href);
  const match = url.pathname.match(/^\/p\/([^/]+)\/([^/]+)/);
  if (!match) return href;
  const key = `${match[1]}/${match[2]}`;
  let token = cache.get(key);
  if (token === undefined) {
    const result = await reviewToken(match[1], match[2]);
    token = result.ok ? result.value : "";
    cache.set(key, token);
  }
  if (token) url.searchParams.set("review", token);
  return url.href;
}

function Code({ href, onArrived }: { href: string; onArrived: () => void }) {
  const { size, path } = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(href);
    code.make();
    const size = code.getModuleCount();
    let path = "";
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) if (code.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
    }
    return { size, path };
  }, [href]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Scan to open this prototype on your phone"
      shapeRendering="crispEdges"
      onAnimationEnd={onArrived}
      className="fade-enter absolute inset-0 size-full bg-[var(--qr-bg)]"
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
