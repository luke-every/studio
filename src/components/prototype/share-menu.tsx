"use client";

import { useRef, useState, type PointerEvent } from "react";

import { MotionPopover } from "@/components/motion";
import { CodeIcon, ExternalIcon, LinkIcon, ShareIcon, UploadIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";
import { shareLink } from "@/lib/registry/actions";

import { menuItem } from "@/components/ui/menu-item";

const item = `${menuItem} text-foreground`;

/**
 * Copies a link that opens without the password: the latest version, or the one `key` names, on its canvas when asked.
 * The link is made on the server, so the copy is handed a promise of it: Safari only lets a page write the clipboard straight from a tap.
 */
export function copyShareLink(slug: string, notify: (message: string, error?: boolean) => void, done: string, { key, canvas, dev }: { key?: string; canvas?: boolean; dev?: boolean } = {}) {
  const link = shareLink(slug, key, dev).then((result) => {
    if (!result.ok) throw new Error(result.error);
    return `${window.location.origin}${result.value}${canvas ? "#canvas" : ""}`;
  });
  const copied =
    typeof ClipboardItem === "undefined"
      ? link.then((text) => navigator.clipboard.writeText(text))
      : navigator.clipboard.write([new ClipboardItem({ "text/plain": link.then((text) => new Blob([text], { type: "text/plain" })) })]);
  copied.then(
    () => notify(done),
    () => notify("Couldn't copy the share link", true),
  );
}

/**
 * Everything for getting this prototype in front of somebody else: copy a link
 * (to the prototype or to its canvas, both the latest version) that opens without the password, or open it in a tab. A link pinned to one version is the version menu's. Opens on hover with a mouse, on a tap otherwise.
 */
export function ShareMenu({
  slug,
  newTab,
  onOpenNew,
  prominent,
  onPush,
}: {
  slug: string;
  /** Push a version from this folder, the menu's first row. Only the canvas passes it: that is where a version is made. */
  onPush?: () => void;
  /** The one thing the bar is for: a labelled, solid button instead of an icon. */
  prominent?: boolean;
  /** Where "Open prototype" goes. */
  newTab?: string;
  /** Opens it another way, where a plain link won't do (a phone, which carries the comment link along). */
  onOpenNew?: () => void;
}) {
  const { notify } = useStudio();
  const [open, setOpen] = useState(false);
  const leaving = useRef<number>(undefined);

  const enter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(leaving.current);
    setOpen(true);
  };
  // A moment's grace, so the pointer can cross the gap to the list.
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    leaving.current = window.setTimeout(() => setOpen(false), 200);
  };

  const copy = (kind: "prototype" | "canvas" | "dev") => {
    setOpen(false);
    const done = { prototype: "Copied a link to the prototype", canvas: "Copied a link to the canvas", dev: "Copied the dev link" }[kind];
    copyShareLink(slug, notify, done, { canvas: kind === "canvas", dev: kind === "dev" });
  };

  return (
    <div onPointerEnter={enter} onPointerLeave={leave}>
      <MotionPopover
        open={open}
        onClose={() => setOpen(false)}
        className="w-60"
        trigger={
          <IconButton variant={prominent ? "primary" : undefined} tooltipAlign="end" onClick={() => setOpen((value) => !value)} aria-label="Share" aria-haspopup="menu" aria-expanded={open}>
            {prominent ? "Share" : <ShareIcon />}
          </IconButton>
        }
      >
        <div role="menu" className="flex flex-col">
          {onPush ? (
            <>
              <button type="button" role="menuitem" aria-haspopup="dialog" onClick={() => (setOpen(false), onPush())} className={`${item} font-medium`}>
                <UploadIcon />
                Push
              </button>
              <div role="separator" className="my-1 h-px bg-border" />
            </>
          ) : null}
          <button type="button" role="menuitem" onClick={() => copy("prototype")} className={item}>
            <LinkIcon />
            Copy prototype link
          </button>
          <button type="button" role="menuitem" onClick={() => copy("canvas")} className={item}>
            <LinkIcon />
            Copy canvas link
          </button>
          <button type="button" role="menuitem" onClick={() => copy("dev")} className={item}>
            <CodeIcon />
            Copy dev link
          </button>
          {newTab ? (
            onOpenNew ? (
              <button type="button" role="menuitem" onClick={() => (setOpen(false), onOpenNew())} className={item}>
                <ExternalIcon />
                Open prototype
              </button>
            ) : (
              <a role="menuitem" href={newTab} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className={item}>
                <ExternalIcon />
                Open prototype
              </a>
            )
          ) : null}
        </div>
      </MotionPopover>
    </div>
  );
}
