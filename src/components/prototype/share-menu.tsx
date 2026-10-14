"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

import { MotionPopover } from "@/components/motion";
import { ExternalIcon, LinkIcon, ShareIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";
import { shareLink } from "@/lib/registry/actions";

import { QrSkeleton } from "./qr-skeleton";
import { menuItem } from "@/components/ui/menu-item";

const PhoneQr = dynamic(() => import("./phone-qr").then((m) => m.PhoneQr), { ssr: false });

const item = `${menuItem} text-foreground`;

/**
 * Everything for getting this version in front of somebody else: copy a link
 * that opens without the password, open it in a tab, or scan its code from a
 * phone. Opens on hover with a mouse, on a tap otherwise.
 */
export function ShareMenu({
  slug,
  versionKey,
  version,
  stage,
  newTab,
  onOpenNew,
}: {
  slug: string;
  versionKey: string;
  version: string;
  /** Where the prototype is drawn, so the code can follow what is open in it. */
  stage: RefObject<HTMLElement | null>;
  /** Where "Open prototype" goes. */
  newTab?: string;
  /** Opens it another way, where a plain link won't do (a phone, which carries the comment link along). */
  onOpenNew?: () => void;
}) {
  const { notify } = useStudio();
  const [open, setOpen] = useState(false);
  const leaving = useRef<number>(undefined);

  // Fetched ahead, so the code's placeholder is there the moment the menu opens.
  useEffect(() => {
    void import("./phone-qr");
  }, []);

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

  // The link is made on the server, so the copy is handed a promise of it: Safari only lets a page write the clipboard straight from a tap.
  const copy = () => {
    setOpen(false);
    const link = shareLink(slug, versionKey).then((result) => {
      if (!result.ok) throw new Error(result.error);
      return `${window.location.origin}${result.value}`;
    });
    const copied =
      typeof ClipboardItem === "undefined"
        ? link.then((text) => navigator.clipboard.writeText(text))
        : navigator.clipboard.write([new ClipboardItem({ "text/plain": link.then((text) => new Blob([text], { type: "text/plain" })) })]);
    copied.then(
      () => notify(`Copied a share link to ${version}`),
      () => notify("Couldn't copy the share link", true),
    );
  };

  return (
    <div onPointerEnter={enter} onPointerLeave={leave}>
      <MotionPopover
        open={open}
        onClose={() => setOpen(false)}
        className="w-60"
        trigger={
          <IconButton tooltipAlign="end" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
            <ShareIcon />
            Share
          </IconButton>
        }
      >
        <div role="menu" className="flex flex-col">
          <button type="button" role="menuitem" onClick={copy} className={item}>
            <LinkIcon />
            Copy share link
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
          {/* Hidden on a phone, which is what would be scanning it. */}
          <div className="mt-1 flex flex-col items-center gap-2 border-t border-border px-2.5 pb-2 pt-3 max-sm:hidden">
            {/* A fixed size, so the menu is the same height with the placeholder as with the code. */}
            <div className="size-40 rounded-[var(--r-control)] bg-[var(--qr-bg)] p-2">
              <div className="relative size-36">
                <QrSkeleton />
                <PhoneQr stage={stage} className="absolute inset-0 size-full" />
              </div>
            </div>
            <p className="text-xs text-foreground-subtle">Scan to open on a phone</p>
          </div>
        </div>
      </MotionPopover>
    </div>
  );
}
