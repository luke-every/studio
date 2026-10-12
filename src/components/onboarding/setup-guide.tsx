"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { PlusIcon, UploadIcon } from "@/components/shell/nav-icons";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";
import { studioPassword } from "@/lib/registry/actions";

const subscribe = () => () => {};

/** Something to paste, with a button that copies it. */
function CodeField({ code, label, empty }: { code: string; label?: string; empty?: string }) {
  const { notify } = useStudio();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      notify("Copied");
    } catch {
      // Clipboard blocked: the text is on screen to select.
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-[var(--r-md)] bg-tile p-2 pl-3">
      {label ? <span className="text-ui text-foreground-subtle">{label}</span> : null}
      <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-pre text-ui text-foreground [font-family:inherit]">{code || empty}</code>
      {code ? <Button onClick={copy}>Copy</Button> : null}
    </div>
  );
}

/**
 * How to start pushing prototypes, for someone who has never done it.
 * Everything is on the page: the one command, with this studio's address
 * already in it, then what to do in Claude Code.
 */
export function SetupGuide() {
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const [password, setPassword] = useState("");
  useEffect(() => {
    studioPassword().then(setPassword);
  }, []);
  const command = `curl -fsSL ${origin || "https://…"}/install.sh | sh`;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-[var(--leading-relaxed)] text-foreground-muted">
        Connect Claude Code once, and everything you make appears here to
        explore, comment on and revisit.
      </p>

      <ol className="flex flex-col gap-5">
        <li className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-base text-foreground">
              <span className="text-foreground-subtle">1.</span> Connect Claude Code to the studio
            </p>
            <p className="text-sm text-foreground-subtle">
              It installs both and asks for the password once. You need Claude Code and Node.js.
            </p>
          </div>
          <CodeField code={command} />
          <CodeField label="Password" code={password} empty="No password set" />
        </li>

        <li className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-base text-foreground">
              <span className="text-foreground-subtle">2.</span> Open Claude Code in your prototype&rsquo;s folder
            </p>
            <p className="text-sm text-foreground-subtle">
              Use the path to wherever your prototype lives; this one is just an example.
            </p>
          </div>
          <CodeField code={"cd ~/Claude/my-prototype\nclaude"} />
        </li>

        <li className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-base text-foreground">
              <span className="text-foreground-subtle">3.</span> Set up your prototype
            </p>
            <p className="text-sm text-foreground-subtle">
              Pulls from the team conventions on GitHub, so every prototype is built in the same formats, language and conventions. Type this in Claude Code, in an empty folder.
            </p>
          </div>
          <CodeField code="/newprototype" />
        </li>
      </ol>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground-muted">Two commands to use in Claude Code</p>
        <ul className="flex flex-col gap-2">
          {[
            {
              name: "/newprototype",
              icon: <PlusIcon className="size-3.5" />,
              text: "Pulls from the team conventions on GitHub, so every prototype is built in the same formats, language and conventions.",
            },
            {
              name: "/push",
              icon: <UploadIcon className="size-3.5" />,
              text: "Works out what changed, writes it up and uploads it here. The first time, it asks which team the prototype belongs to.",
            },
          ].map((skill) => (
            <li key={skill.name} className="flex items-start gap-2.5 rounded-[var(--r-md)] border border-border px-3 py-2">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[var(--r-sm)] bg-tile text-foreground">{skill.icon}</span>
              <p className="text-sm leading-[var(--leading-relaxed)] text-foreground-subtle">
                <span className="font-medium text-foreground">{skill.name}</span> &mdash; {skill.text}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
