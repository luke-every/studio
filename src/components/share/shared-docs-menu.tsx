"use client";

import { useState } from "react";

import { canHover, MotionPopover } from "@/components/motion";
import { DocumentIcon, ExternalIcon, FigmaIcon, GithubIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { menuItem } from "@/components/ui/menu-item";

export type DocLinks = { figma?: string; notion?: string; claude?: string; notionCopy?: string; github?: string };

/** The studio's Docs menu for somebody with a share link: only what exists, and only to open. A row that has nothing behind it isn't drawn. */
export function SharedDocsMenu({ links }: { links: DocLinks }) {
  const [open, setOpen] = useState(false);
  const rows = [
    { url: links.notion, label: "Notion", Icon: DocumentIcon },
    { url: links.figma, label: "Figma", Icon: FigmaIcon },
    { url: links.claude, label: "Claude doc", Icon: DocumentIcon },
    { url: links.notionCopy, label: "Notion page", Icon: DocumentIcon },
    { url: links.github, label: "GitHub", Icon: GithubIcon },
  ].flatMap((row) => (row.url ? [{ ...row, url: row.url }] : []));
  if (!rows.length) return null;
  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      onOpen={() => setOpen(true)}
      align="start"
      className="w-56"
      trigger={
        <IconButton label="Docs" tooltip={false} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((now) => canHover() || !now)}>
          <DocumentIcon />
        </IconButton>
      }
    >
      <div role="menu" aria-label="Docs" className="flex flex-col">
        {rows.map(({ url, label, Icon }) => (
          <a key={label} href={url} target="_blank" rel="noreferrer" role="menuitem" className={`${menuItem} text-foreground`}>
            <Icon />
            <span className="truncate">{label}</span>
            <ExternalIcon className="ml-auto text-foreground-subtle" />
          </a>
        ))}
      </div>
    </MotionPopover>
  );
}
