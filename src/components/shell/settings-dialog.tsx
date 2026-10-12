"use client";

import { MotionModal } from "@/components/motion";
import { Button } from "@/components/ui/button";

import { ThemeRow } from "./theme-row";

/** What can be changed about how the studio looks. Opened from the user menu. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <MotionModal open={open} onClose={onClose} label="Settings">
      <div className="flex flex-col gap-5">
        <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">Settings</h2>
        <ThemeRow />
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </MotionModal>
  );
}
