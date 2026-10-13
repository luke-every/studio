"use client";

import type { ReactNode } from "react";

import { MotionPopover } from "@/components/motion";

import { Button } from "./button";

/**
 * A question asked where the button was pressed: a small card that grows out
 * of the trigger, with what is being asked and two buttons side by side,
 * Cancel on the left and the answer on the right. Green for something
 * affirmative, red for something that can't be taken back.
 *
 * For a decision about one small thing. A bigger one (or one with fields)
 * is a dialog; see `DialogForm`.
 */
export function ConfirmPopover({
  open,
  onClose,
  trigger,
  message,
  confirmLabel,
  tone = "positive",
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  message: string;
  confirmLabel: string;
  tone?: "positive" | "destructive";
  onConfirm: () => void;
}) {
  return (
    <MotionPopover open={open} onClose={onClose} trigger={trigger} className="w-60">
      <div role="alertdialog" aria-label={message} className="flex flex-col gap-3 p-2">
        <p className="text-ui text-foreground">{message}</p>
        <div className="flex gap-2">
          <Button onClick={onClose} className="!h-9 flex-1 !px-3">
            Cancel
          </Button>
          <Button
            variant={tone}
            onClick={() => {
              onClose();
              onConfirm();
            }}
            className="!h-9 flex-1 !px-3"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </MotionPopover>
  );
}
