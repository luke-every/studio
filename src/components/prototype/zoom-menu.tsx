"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { CheckIcon, ChevronDownIcon } from "@/components/shell/nav-icons";
import { ZOOMS } from "@/lib/phone";

const percent = (zoom: number) => `${Math.round(zoom * 100)}%`;

/** How big the preview is drawn. 100% is the phone's real size on screen. */
export function ZoomMenu({
  zoom,
  fitted,
  onChange,
}: {
  zoom: number;
  /** While the preview is scaled to fit: the size that works out to. Then no size is picked. */
  fitted?: number | null;
  onChange: (zoom: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="start"
      className="w-32"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Zoom"
          className="flex items-center gap-2 whitespace-nowrap rounded-[var(--r-tag)] bg-surface px-3 py-2 text-sm hover:bg-surface-hover"
        >
          <span className="font-medium text-foreground">{percent(fitted ?? zoom)}</span>
          <ChevronDownIcon className="size-3.5 text-foreground-subtle" />
        </button>
      }
    >
      <ul role="listbox" aria-label="Zoom" className="flex flex-col">
        {ZOOMS.map((option) => (
          <li key={option}>
            <button
              type="button"
              role="option"
              aria-selected={fitted == null && option === zoom}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-[var(--r-sm)] px-2.5 py-2 text-left text-sm hover:bg-surface-hover"
            >
              <span className="flex-1 font-medium text-foreground">{percent(option)}</span>
              <span className="grid size-4 place-items-center">
                {fitted == null && option === zoom ? <CheckIcon className="text-foreground" /> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </MotionPopover>
  );
}
