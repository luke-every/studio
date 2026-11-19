"use client";

import { useState } from "react";

import { canHover, MotionPopover } from "@/components/motion";
import { ChevronDownIcon, FitIcon, MinusIcon, PlayIcon, PlusIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { useCanvasZoom } from "@/lib/canvas-zoom";

const percent = (scale: number) => `${Math.round(scale * 100)}%`;
const step = "grid size-8 place-items-center rounded-[var(--r-full)] text-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-hover";
const row = "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-control)] border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-[var(--control-hover)]";

/** The canvas's zoom, in the top bar beside share: where it is now, a step either way, back to 100%, and fitting everything in. Nothing when there is no canvas. */
export function CanvasZoomMenu() {
  const zoom = useCanvasZoom();
  const [open, setOpen] = useState(false);
  if (!zoom) return null;
  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      onOpen={() => setOpen(true)}
      align="end"
      className="w-56"
      trigger={
        <IconButton label="Zoom" tooltip={false} onClick={() => setOpen((value) => canHover() || !value)} aria-haspopup="menu" aria-expanded={open}>
          <span className="tabular-nums">{percent(zoom.scale)}</span>
          <ChevronDownIcon className="size-3.5 text-foreground-subtle" />
        </IconButton>
      }
    >
      <div className="flex flex-col gap-2 p-1.5">
        <div role="group" aria-label="Zoom" className="inline-flex h-9 items-center justify-between rounded-[var(--r-control)] border border-border bg-surface p-0.5">
          <button type="button" aria-label="Zoom out" onClick={zoom.zoomOut} className={step}>
            <MinusIcon />
          </button>
          <span aria-live="polite" className="min-w-12 text-center text-sm font-medium tabular-nums text-foreground">
            {percent(zoom.scale)}
          </span>
          <button type="button" aria-label="Zoom in" onClick={zoom.zoomIn} className={step}>
            <PlusIcon />
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => (zoom.reset(), setOpen(false))} className={row}>
            100%
          </button>
          <button type="button" onClick={() => (zoom.fit(), setOpen(false))} className={row}>
            <FitIcon className="size-4" />
            Fit
          </button>
        </div>
      </div>
    </MotionPopover>
  );
}

/** Opens the screen selected on the canvas (or the one an element selected is in) to use it: blue when there is one, dim when not. */
export function CanvasPlayButton() {
  const zoom = useCanvasZoom();
  if (!zoom) return null;
  return (
    <IconButton
      label="Interact"
      disabled={!zoom.play}
      className={zoom.play ? "!bg-[var(--selection)] !text-[var(--selection-foreground)] hover:!bg-[var(--selection-hover)]" : ""}
      onClick={() => zoom.play?.()}
    >
      <PlayIcon />
    </IconButton>
  );
}
