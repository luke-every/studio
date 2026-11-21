"use client";

import { barControl, IconButton } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { canHover, MotionPopover } from "@/components/motion";
import { ChevronDownIcon, CopyIcon } from "@/components/shell/nav-icons";
import { copyShareLink } from "@/components/prototype/share-menu";
import { menuItem } from "@/components/ui/menu-item";
import { Stamp } from "@/components/ui/stamp";
import { useStudio } from "@/lib/data/studio-store";
import type { PrototypeVersion } from "@/lib/registry/types";

/** A dev server is running: the version on screen is the app as it is now. */
const LiveDot = ({ running = true }: { running?: boolean }) => (
  <span aria-hidden className={`size-1.5 shrink-0 self-center rounded-[var(--r-full)] ${running ? "bg-success pulse-soft" : "bg-foreground-subtle"}`} />
);

/** Where the dev server is: running, or one of the things it is being made to do (the menu says which), or stopped. */
type Server = "running" | "stopped" | "starting" | "restarting" | "stopping";

const miniButton = "shrink-0 rounded-[var(--r-full)] bg-surface-inset px-1.5 py-0.5 text-xs font-medium text-foreground-muted hover:text-foreground disabled:text-foreground-subtle disabled:hover:text-foreground-subtle";

/** The dev server as a row of the list: its address to copy, and a way to start it, stop it, or start it again. */
function LiveRow({ slug, version, on, onSelect, server, setServer, onProblem }: { slug: string; version: PrototypeVersion; on: boolean; onSelect: () => void; server: Server; setServer: (server: Server) => void; onProblem: (message: string) => void }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const busy = server === "starting" || server === "restarting" || server === "stopping";

  const copy = () => {
    if (!version.liveUrl) return;
    navigator.clipboard.writeText(version.liveUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, () => {});
  };
  const stop = () => {
    setServer("stopping");
    fetch(`/api/dev-server?slug=${encodeURIComponent(slug)}`, { method: "DELETE" }).then(
      () => setServer("stopped"),
      () => setServer("running"),
    );
  };
  // Starting takes a few seconds: the button says so until the server is up, and then the page reads it again.
  const start = (action: "start" | "restart") => {
    setServer(action === "start" ? "starting" : "restarting");
    fetch(`/api/dev-server?slug=${encodeURIComponent(slug)}&action=${action}`, { method: "POST" })
      .then((response) => response.json() as Promise<{ ok: boolean; error?: string }>)
      .then((result) => {
        if (!result.ok) {
          setServer("stopped");
          onProblem(result.error ?? "The server couldn't be started.");
          return;
        }
        setServer("running");
        router.refresh();
      })
      .catch(() => {
        setServer("stopped");
        onProblem("The server couldn't be started.");
      });
  };

  return (
    <div className={`${menuItem} justify-between text-foreground ${on ? "bg-menu-hover" : ""}`}>
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <button type="button" role="option" aria-selected={on} onClick={onSelect} className="flex items-center gap-1.5">
          <LiveDot running={server === "running"} />
          Live
        </button>
        {version.liveUrl && server === "running" ? (
          <button type="button" onClick={copy} title="Copy address" className="max-w-full truncate text-sm text-foreground-subtle hover:text-foreground">
            {copied ? "Copied" : version.liveUrl}
          </button>
        ) : (
          <span className="text-sm text-foreground-subtle">{server === "stopped" ? "Stopped" : server === "starting" ? "Starting" : server === "restarting" ? "Restarting" : "Stopping"}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {server === "stopped" ? (
          <button type="button" onClick={() => start("start")} className={miniButton}>
            Start
          </button>
        ) : (
          <>
            <button type="button" onClick={() => start("restart")} disabled={busy} className={miniButton}>
              {server === "restarting" ? "Restarting" : "Restart"}
            </button>
            <button type="button" onClick={stop} disabled={busy} className={miniButton}>
              {server === "stopping" ? "Stopping" : "Stop"}
            </button>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * The version, and when it was made. With more than one it is a button that
 * opens the list; with one there is nothing to choose, so it is plain text, except Live,
 * whose list is also where its dev server is stopped, started and started again.
 */
export function VersionMenu({
  slug,
  versions,
  selectedId,
  onSelect,
}: {
  slug: string;
  versions: PrototypeVersion[];
  selectedId: string;
  onSelect: (version: PrototypeVersion) => void;
}) {
  const { notify } = useStudio();
  const [open, setOpen] = useState(false);
  const [server, setServer] = useState<Server>("running");
  const selected = versions.find((version) => version.id === selectedId) ?? versions[0];
  const hasLive = versions.some((version) => version.live);

  const label = (
    <>
      {selected.live ? <LiveDot running={server === "running"} /> : null}
      {selected.live ? "Live" : selected.version}
      {versions.length > 1 || hasLive ? <ChevronDownIcon className="size-3.5 text-foreground-subtle" /> : null}
    </>
  );

  if (versions.length < 2 && !hasLive) return <div className={barControl}>{label}</div>;

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      onOpen={() => setOpen(true)}
      align="start"
      className="w-64"
      trigger={
        <IconButton onClick={() => setOpen((value) => canHover() || !value)} aria-haspopup="listbox" aria-expanded={open}>
          {label}
        </IconButton>
      }
    >
      <ul role="listbox" aria-label="Versions" className="flex max-h-96 flex-col overflow-y-auto">
        {versions.map((version) => {
          const on = version.id === selectedId;
          if (version.live) {
            return (
              <li key={version.id}>
                <LiveRow
                  slug={slug}
                  version={version}
                  on={on}
                  server={server}
                  setServer={setServer}
                  onProblem={(message) => notify(message, true)}
                  onSelect={() => {
                    onSelect(version);
                    setOpen(false);
                  }}
                />
              </li>
            );
          }
          return (
            <li key={version.id}>
              {/* A row is the whole of what it selects; the copy button inside it is its own tap. */}
              <div
                role="option"
                tabIndex={0}
                aria-selected={on}
                onClick={() => {
                  onSelect(version);
                  setOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelect(version);
                  setOpen(false);
                }}
                className={`${menuItem} cursor-pointer justify-between text-foreground ${on ? "bg-menu-hover" : ""}`}
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span>{version.version}</span>
                  <button
                    type="button"
                    title={`Copy link to ${version.version}`}
                    aria-label={`Copy link to ${version.version}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      copyShareLink(slug, notify, `Copied a link to ${version.version}`, { key: version.key });
                    }}
                    className="flex shrink-0 translate-y-0.5 text-foreground-subtle hover:text-foreground"
                  >
                    <CopyIcon className="size-3.5" />
                  </button>
                  <span className="truncate text-sm text-foreground-subtle">
                    <Stamp iso={version.createdAt} />
                  </span>
                </span>
                {on ? (
                  <span className="shrink-0 rounded-[var(--r-full)] bg-surface-inset px-1.5 py-0.5 text-xs font-medium text-foreground-muted">Current</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </MotionPopover>
  );
}
