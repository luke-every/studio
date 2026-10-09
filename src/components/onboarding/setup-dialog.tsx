"use client";

import { MotionModal } from "@/components/motion";
import { ProjectOrb } from "@/components/project/project-orb";
import { SparkleIcon } from "@/components/shell/nav-icons";
import { Button } from "@/components/ui/button";

import { SetupGuide } from "./setup-guide";

/** How to get set up to push prototypes from Claude Code. Opened from the corner prompt and from the user menu. */
export function SetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
      <MotionModal open={open} onClose={onClose} label="Get set up">
        <div className="flex flex-col gap-5">
          <div className="relative size-14">
            <ProjectOrb seed="get-set-up" className="!aspect-square size-full !rounded-[var(--r-lg)]" />
            <SparkleIcon className="absolute inset-0 m-auto size-6 text-white" />
          </div>
          <h2 className="-mt-1 text-md font-medium tracking-[var(--tracking-tight)]">Get set up</h2>
          <SetupGuide />
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </MotionModal>
  );
}
