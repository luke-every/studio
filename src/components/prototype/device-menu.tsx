"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { CheckIcon, ChevronDownIcon } from "@/components/shell/nav-icons";
import { barControl } from "@/components/ui/button";
import { DEVICES, type Device } from "@/lib/phone";

/** Which phone the prototype is previewed on: its name and size, and a list of the common ones. */
export function DeviceMenu({ device, onChange }: { device: Device; onChange: (device: Device) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="start"
      className="w-72"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Preview on"
          className={barControl}
        >
          <span>{device.name}</span>
          <span className="font-normal text-foreground-subtle">
            {device.width} × {device.height}
          </span>
          <ChevronDownIcon className="size-3.5 text-foreground-subtle" />
        </button>
      }
    >
      <ul role="listbox" aria-label="Phones" className="flex max-h-[32rem] flex-col overflow-y-auto">
        {DEVICES.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              role="option"
              aria-selected={option.id === device.id}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-[var(--r-sm)] px-2.5 py-2 text-left text-sm hover:bg-surface-hover"
            >
              <span className="flex-1 font-medium text-foreground">{option.name}</span>
              <span className="text-foreground-subtle">
                {option.width} × {option.height}
              </span>
              <span className="grid size-4 place-items-center">
                {option.id === device.id ? <CheckIcon className="text-foreground" /> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </MotionPopover>
  );
}
