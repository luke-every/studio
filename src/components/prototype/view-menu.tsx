"use client";

import { useState, type ReactNode } from "react";

import { MotionPopover } from "@/components/motion";
import { ChevronDownIcon, DesktopIcon, FitIcon, LargePhoneIcon, MinusIcon, PlusIcon, SmallPhoneIcon, TabletIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { DEVICES, ZOOMS, type Device } from "@/lib/phone";

const percent = (zoom: number) => `${Math.round(zoom * 100)}%`;

const icons: Record<string, ReactNode> = {
  "iphone-se": <SmallPhoneIcon className="size-6" />,
  "iphone-14": <LargePhoneIcon className="size-6" />,
  tablet: <TabletIcon className="size-6" />,
  desktop: <DesktopIcon className="size-6" />,
};

const step = "grid size-8 place-items-center rounded-[var(--r-full)] text-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-hover disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * How the prototype is previewed, in one place: how big it is drawn (a step
 * down or up, or fitted to the room) and which device it is laid out for.
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

  // What is on screen now, whether chosen or fitted; a step goes from there to the next size in that direction.
  const now = fit && fitted ? fitted : zoom;
  const smaller = [...ZOOMS].reverse().find((size) => size < now - 0.005);
  const larger = ZOOMS.find((size) => size > now + 0.005);
  const go = (size: number | undefined) => {
    if (size === undefined) return;
    onZoom(size);
    onFit(false);
  };

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="center"
      className="w-72"
      trigger={
        <IconButton onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
          <span>
            {device.name} · {percent(now)}
          </span>
          <ChevronDownIcon className="size-3.5 text-foreground-subtle" />
        </IconButton>
      }
    >
      <div className="flex flex-col gap-3 p-1.5">
        {/* Size: a step down, the size, a step up, and fitting to the room. */}
        <div className="flex items-center justify-between gap-2">
          <div role="group" aria-label="Zoom" className="inline-flex h-9 items-center rounded-[var(--r-control)] border border-border bg-surface p-0.5">
            <button type="button" aria-label="Zoom out" disabled={smaller === undefined} onClick={() => go(smaller)} className={step}>
              <MinusIcon />
            </button>
            <span aria-live="polite" className="min-w-12 text-center text-sm font-medium tabular-nums text-foreground">
              {percent(now)}
            </span>
            <button type="button" aria-label="Zoom in" disabled={larger === undefined} onClick={() => go(larger)} className={step}>
              <PlusIcon />
            </button>
          </div>
          <button
            type="button"
            aria-pressed={fit}
            onClick={() => onFit(true)}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--r-control)] border px-4 text-sm font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${
              fit ? "border-transparent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground hover:bg-surface-hover"
            }`}
          >
            <FitIcon className="size-4" />
            Fit
          </button>
        </div>

        {/* Device: a tile each, drawn to its proportions. */}
        <div role="radiogroup" aria-label="Device" className="grid grid-cols-4 gap-1.5">
          {DEVICES.map((option) => {
            const on = option.id === device.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={on}
                title={`${option.width} × ${option.height}`}
                onClick={() => onDevice(option)}
                className={`flex flex-col items-center gap-1.5 rounded-[var(--r-lg)] px-1 py-2.5 text-center transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${
                  on ? "bg-surface-inset text-foreground ring-1 ring-border-strong" : "text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                {icons[option.id]}
                <span className="text-xs font-medium leading-tight">{option.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </MotionPopover>
  );
}
