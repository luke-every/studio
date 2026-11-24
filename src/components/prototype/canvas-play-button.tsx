"use client";

import { PlayIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { useCanvasZoom } from "@/lib/canvas-zoom";

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
