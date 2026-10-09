"use client";

import { useSyncExternalStore } from "react";

import { MotionModal } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";

const subscribe = () => () => {};

/**
 * Remix: make an independent copy of the version on screen. The prototype's
 * menu opens this, with the one command to paste into Terminal, which copies the version into a new
 * folder and opens Claude Code in it. The original is only ever read; what
 * comes back through /push is a prototype of its own.
 */
export function RemixDialog({
  slug,
  version,
  name,
  open,
  onClose,
}: {
  slug: string;
  version: string;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const { notify } = useStudio();
  const command = `curl -fsSL ${origin || "https://…"}/remix/${slug}/${version} | sh`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      notify("Copied");
    } catch {
      // Clipboard blocked: the command is on screen to select.
    }
  };

  return (
    <>
      <MotionModal open={open} onClose={onClose} label={`Remix ${name}`}>
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">
              Remix {name} {version}
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Paste this into Terminal. It copies this version into a new folder and opens Claude Code
              there, ready for you to change it. The original stays as it is.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-[var(--r-md)] bg-tile p-2 pl-3">
            <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap text-ui text-foreground [font-family:inherit]">
              {command}
            </code>
            <Button onClick={copy}>Copy</Button>
          </div>

          <p className="text-sm text-foreground-subtle">
            When you&rsquo;re happy with it, type /push in Claude Code and it is saved here as its own
            prototype. The first time, the command also sets up /push and asks for the studio password.
          </p>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </MotionModal>
    </>
  );
}
