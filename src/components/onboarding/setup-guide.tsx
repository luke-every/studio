"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";

const subscribe = () => () => {};

/**
 * How to start pushing prototypes, for someone who has never done it.
 * Everything is on the page: the one command, with this studio's address
 * already in it, then what to do in Claude Code.
 */
export function SetupGuide() {
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const { notify } = useStudio();
  const command = `curl -fsSL ${origin || "https://…"}/install.sh | sh`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      notify("Copied");
    } catch {
      // Clipboard blocked: the command is on screen to select.
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-[var(--leading-relaxed)] text-foreground-muted">
        Push a prototype from Claude Code and it shows up here a minute later. You don&rsquo;t need a
        GitHub account or any keys &mdash; only this studio&rsquo;s password, the one you used to get in.
      </p>

      <ol className="flex flex-col gap-5">
        <li className="flex flex-col gap-2">
          <p className="text-base text-foreground">
            <span className="text-foreground-subtle">1.</span> Paste this into Terminal
          </p>
          <div className="flex items-center gap-2 rounded-[var(--r-md)] bg-tile p-2 pl-3">
            <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap text-ui text-foreground [font-family:inherit]">
              {command}
            </code>
            <Button onClick={copy}>Copy</Button>
          </div>
          <p className="text-sm text-foreground-subtle">
            It installs /push and asks for the password once. You need Claude Code and Node.js.
          </p>
        </li>

        <li>
          <p className="text-base text-foreground">
            <span className="text-foreground-subtle">2.</span> Open Claude Code in your prototype&rsquo;s folder
          </p>
        </li>

        <li className="flex flex-col gap-1">
          <p className="text-base text-foreground">
            <span className="text-foreground-subtle">3.</span> Type /push
          </p>
          <p className="text-sm text-foreground-subtle">
            Claude works out what changed, writes it up and uploads it. The first time, it asks which team
            the prototype belongs to.
          </p>
        </li>
      </ol>

      <p className="text-sm text-foreground-subtle">
        The same command also sets up /newprototype, for starting a new prototype in the team&rsquo;s
        style. It uses the same password, so there&rsquo;s nothing else to install or ask for.
      </p>

      <p className="text-sm text-foreground-subtle">Run the command again any time to update.</p>
    </div>
  );
}
