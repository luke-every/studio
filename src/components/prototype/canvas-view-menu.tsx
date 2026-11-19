"use client";

import { useState } from "react";

import { canHover, MotionPopover } from "@/components/motion";
import {
  CheckIcon,
  ChevronDownIcon,
  FoldIcon,
} from "@/components/shell/nav-icons";
import { deviceIcons } from "@/components/prototype/view-menu";
import { IconButton } from "@/components/ui/button";
import { menuItem } from "@/components/ui/menu-item";
import type { Device } from "@/lib/phone";

const row = `${menuItem} justify-between text-foreground aria-disabled:opacity-50`;

/** How the canvas is looked at, in the card with the zoom: flow or variants, which devices the screens are shown on (one always stays on), and the fold. */
export function CanvasViewMenu({
  devices,
  on,
  onDevice,
  kind,
  onKind,
  fold,
  onFold,
}: {
  devices: readonly Device[];
  on: string[];
  onDevice: (id: string) => void;
  /** Only when the version has both a flow and variants. */
  kind?: "flow" | "variants";
  onKind?: (kind: "flow" | "variants") => void;
  fold: boolean;
  onFold: () => void;
}) {
  const [open, setOpen] = useState(false);
  const Shown =
    deviceIcons[(devices.find((one) => on.includes(one.id)) ?? devices[0]).id];
  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      onOpen={() => setOpen(true)}
      align="end"
      className="w-56"
      trigger={
        <IconButton
          label="View"
          tooltip={false}
          variant="ghost"
          onClick={() => setOpen((value) => canHover() || !value)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Shown />
          <ChevronDownIcon className="size-3.5 text-foreground-subtle" />
        </IconButton>
      }
    >
      <div role="menu" aria-label="View" className="flex flex-col">
        {kind && onKind ? (
          <>
            {(["flow", "variants"] as const).map((one) => (
              <button
                key={one}
                type="button"
                role="menuitemradio"
                aria-checked={kind === one}
                onClick={() => onKind(one)}
                className={row}
              >
                {one === "flow" ? "Flow" : "Variants"}
                {kind === one ? (
                  <CheckIcon className="text-foreground" />
                ) : null}
              </button>
            ))}
          </>
        ) : null}
        <div
          className={`flex flex-col ${kind && onKind ? "mt-1 border-t border-divider pt-1" : ""}`}
        >
          {devices.map((option) => {
            const Icon = deviceIcons[option.id];
            const shown = on.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={shown}
                aria-disabled={shown && on.length === 1}
                onClick={() =>
                  shown && on.length === 1 ? undefined : onDevice(option.id)
                }
                className={row}
              >
                <span className="flex items-center gap-2.5">
                  <Icon />
                  {option.name}
                </span>
                {shown ? <CheckIcon className="text-foreground" /> : null}
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex flex-col border-t border-divider pt-1">
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={fold}
            onClick={onFold}
            className={row}
          >
            <span className="flex items-center gap-2.5">
              <FoldIcon />
              Fold
            </span>
            {fold ? <CheckIcon className="text-foreground" /> : null}
          </button>
        </div>
      </div>
    </MotionPopover>
  );
}
