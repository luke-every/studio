"use client";

import { barControl, IconButton } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { canHover, MotionPopover } from "@/components/motion";
import { ChevronDownIcon } from "@/components/shell/nav-icons";
import { menuItem } from "@/components/ui/menu-item";
import { Stamp } from "@/components/ui/stamp";
import type { PrototypeVersion } from "@/lib/registry/types";

/** A dev server is running: the version on screen is the app as it is now. */
const LiveDot = () => <span aria-hidden className="size-1.5 shrink-0 self-center rounded-[var(--r-full)] bg-success pulse-soft" />;

/** The running dev server as a row of the list: its address to copy, and a way to stop it. */
function LiveRow({ slug, version, on, onSelect }: { slug: string; version: PrototypeVersion; on: boolean; onSelect: () => void }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [stopping, setStopping] = useState(false);

  const copy = () => {
    if (!version.liveUrl) return;
    navigator.clipboard.writeText(version.liveUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, () => {});
  };
  const stop = () => {
    setStopping(true);
    fetch(`/api/dev-server?slug=${encodeURIComponent(slug)}`, { method: "DELETE" }).finally(() => {
      setStopping(false);
      router.refresh();
    });
  };

  return (
    <div className={`${menuItem} justify-between text-foreground ${on ? "bg-surface-hover" : ""}`}>
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <button type="button" role="option" aria-selected={on} onClick={onSelect} className="flex items-center gap-1.5">
          <LiveDot />
          Live
        </button>
        {version.liveUrl ? (
          <button type="button" onClick={copy} title="Copy address" className="max-w-full truncate text-sm text-foreground-subtle hover:text-foreground">
            {copied ? "Copied" : version.liveUrl}
          </button>
        ) : null}
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={stopping}
        className="shrink-0 rounded-[var(--r-full)] bg-surface-inset px-1.5 py-0.5 text-xs font-medium text-foreground-muted hover:text-foreground disabled:opacity-60"
      >
        {stopping ? "Stopping" : "Stop"}
      </button>
    </div>
  );
}

/**
 * The version, and when it was made. With more than one it is a button that
 * opens the list; with one there is nothing to choose, so it is plain text.
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
  const [open, setOpen] = useState(false);
  const selected = versions.find((version) => version.id === selectedId) ?? versions[0];

  const label = (
    <>
      {selected.live ? <LiveDot /> : null}
      {selected.live ? "Live" : selected.version}
      {versions.length > 1 ? <ChevronDownIcon className="size-3.5 text-foreground-subtle" /> : null}
    </>
  );

  if (versions.length < 2) return <div className={barControl}>{label}</div>;

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
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onSelect(version);
                  setOpen(false);
                }}
                className={`${menuItem} justify-between text-foreground ${on ? "bg-surface-hover" : ""}`}
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span>{version.version}</span>
                  <span className="truncate text-sm text-foreground-subtle">
                    <Stamp iso={version.createdAt} />
                  </span>
                </span>
                {on ? (
                  <span className="shrink-0 rounded-[var(--r-full)] bg-surface-inset px-1.5 py-0.5 text-xs font-medium text-foreground-muted">Currently viewing</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </MotionPopover>
  );
}
