"use client";

import qrcode from "qrcode-generator";
import { useMemo, useSyncExternalStore } from "react";

import { QrSkeleton } from "@/components/prototype/qr-skeleton";

/** A QR code for this very page, so a phone that scans it opens the shared prototype. Themed with the `--qr-*` tokens. */
export function ShareQr() {
  const href = useSyncExternalStore(
    () => () => {},
    () => window.location.href.split("#")[0],
    () => "",
  );
  const { size, path } = useMemo(() => {
    if (!href) return { size: 0, path: "" };
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
    // The same panel as a dropdown (see MotionPopover), without its shadow.
    <div className="flex flex-col items-center gap-1.5 rounded-[var(--r-popover)] border border-border bg-surface-elevated p-4">
      <p className="text-xs text-foreground-subtle">Scan to open on mobile</p>
      <div className="rounded-[var(--r-control)] bg-[var(--qr-bg)] p-2">
        <div className="relative size-20 text-[var(--qr-fg)]">
          {href ? (
            <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Scan to open this prototype on your phone" shapeRendering="crispEdges" className="absolute inset-0 size-full">
              <path d={path} fill="currentColor" />
            </svg>
          ) : (
            <QrSkeleton />
          )}
        </div>
      </div>
    </div>
  );
}
