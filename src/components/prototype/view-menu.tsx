"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { CheckIcon, ChevronDownIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { DEVICES, ZOOMS, type Device } from "@/lib/phone";

const percent = (zoom: number) => `${Math.round(zoom * 100)}%`;

const row = "flex w-full items-center gap-3 rounded-[var(--r-sm)] px-2.5 py-2 text-left text-sm hover:bg-surface-hover";
const heading = "px-2.5 pb-1 pt-2 text-xs text-foreground-subtle";

function Tick({ on }: { on: boolean }) {
  return <span className="grid size-4 place-items-center">{on ? <CheckIcon className="text-foreground" /> : null}</span>;
}

/**
 * How the prototype is previewed, in one place: which phone, and how big it is
 * drawn — a set size, or scaled to fit the room there is.
 */
export function ViewMenu({
  device,
  zoom,
  fit,
  fitted,
  onDevice,
  onZoom,
  onFit,
}: {
  device: Device;
  zoom: number;
  fit: boolean;
  /** While scaled to fit: the size that works out to. */
  fitted: number | null;
  onDevice: (device: Device) => void;
  onZoom: (zoom: number) => void;
  onFit: (fit: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="start"
      className="w-72"
      trigger={
        <IconButton onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
          <span>
            {device.name} · {percent(fit && fitted ? fitted : zoom)}
          </span>
          <ChevronDownIcon className="size-3.5 text-foreground-subtle" />
        </IconButton>
      }
    >
      <div className="flex max-h-[32rem] flex-col overflow-y-auto">
        <p className={heading}>Size</p>
        <button
          type="button"
          aria-pressed={fit}
          onClick={() => {
            onFit(true);
            setOpen(false);
          }}
          className={row}
        >
          <span className="flex-1 font-medium text-foreground">Fit to view</span>
          <Tick on={fit} />
        </button>
        {ZOOMS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={!fit && option === zoom}
            onClick={() => {
              onZoom(option);
              onFit(false);
              setOpen(false);
            }}
            className={row}
          >
            <span className="flex-1 font-medium text-foreground">{percent(option)}</span>
            <Tick on={!fit && option === zoom} />
          </button>
        ))}

        <p className={`${heading} mt-1 border-t border-divider`}>Phone</p>
        <ul role="listbox" aria-label="Phones">
          {DEVICES.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={option.id === device.id}
                onClick={() => {
                  onDevice(option);
                  setOpen(false);
                }}
                className={row}
              >
                <span className="flex-1 font-medium text-foreground">{option.name}</span>
                <span className="text-foreground-subtle">
                  {option.width} × {option.height}
                </span>
                <Tick on={option.id === device.id} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </MotionPopover>
  );
}
