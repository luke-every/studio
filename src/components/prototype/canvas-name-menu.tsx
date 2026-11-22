"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { ArchiveIcon, ChevronDownIcon, PencilIcon, TrashIcon, UndoIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { menuItem } from "@/components/ui/menu-item";
import { useStudio } from "@/lib/data/studio-store";
import type { Prototype, PrototypeVersion } from "@/lib/registry/types";

import { ArchiveDialog, DeletePrototypeDialog, DeleteVersionDialog, ReadyForDevItem, RenameDialog } from "./prototype-menu";
import { VersionList, type Server } from "./version-menu";

type Dialog = "rename" | "delete" | "archive" | "delete-prototype";

const item = `${menuItem} text-foreground`;

/**
 * The canvas's name, and under it the things a prototype is rarely asked: its versions
 * (a row that opens the list in place of the menu, with a way back), rename, delete the version, archive, delete the
 * prototype. The dialogs are the detail page's menu's own.
 */
export function CanvasNameMenu({ prototype, selected, onSelect }: { prototype: Prototype; selected: PrototypeVersion; onSelect: (version: PrototypeVersion) => void }) {
  const { isSaving, updatePrototype } = useStudio();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "versions">("menu");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [server, setServer] = useState<Server>("running");
  const version = selected.live ? "Live" : selected.version;
  // A design QA is managed from Design QA, not here.
  const deletable = !prototype.slug.startsWith("qa-");

  const close = () => {
    setOpen(false);
    setView("menu");
  };
  const choose = (next: Dialog) => {
    close();
    setDialog(next);
  };

  return (
    <>
      <MotionPopover
        open={open}
        onClose={close}
        align="start"
        rootClassName="relative min-w-0"
        className="w-64"
        trigger={
          <IconButton variant="ghost" loading={isSaving("prototype")} className="max-w-full" onClick={() => (open ? close() : setOpen(true))} aria-haspopup="menu" aria-expanded={open}>
            <span className="min-w-0 max-w-48 truncate">{prototype.name}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-foreground-subtle" />
          </IconButton>
        }
      >
        {view === "versions" ? (
          <div className="flex flex-col">
            <button type="button" onClick={() => setView("menu")} className={item}>
              <ChevronDownIcon className="size-3.5 rotate-90 text-foreground-subtle" />
              Version
            </button>
            <div role="separator" className="my-1 h-px bg-border" />
            <VersionList
              slug={prototype.slug}
              versions={prototype.versions}
              selectedId={selected.id}
              onPick={(picked) => {
                onSelect(picked);
                close();
              }}
              server={server}
              setServer={setServer}
            />
          </div>
        ) : (
          <div role="menu" className="flex flex-col">
            {prototype.archived ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  updatePrototype({ slug: prototype.slug, archived: false }, ["prototype"], "Restored");
                }}
                className={item}
              >
                <UndoIcon />
                Unarchive
              </button>
            ) : (
              <>
                <button type="button" role="menuitem" aria-haspopup="listbox" onClick={() => setView("versions")} className={`${item} justify-between`}>
                  Version
                  <span className="flex items-center gap-1 text-foreground-subtle">
                    {version}
                    <ChevronDownIcon className="size-3.5 -rotate-90" />
                  </span>
                </button>
                <div role="separator" className="my-1 h-px bg-border" />
                <button type="button" role="menuitem" onClick={() => choose("rename")} className={item}>
                  <PencilIcon />
                  Rename
                </button>
                <ReadyForDevItem prototype={prototype} version={selected} className={item} onDone={() => setOpen(false)} />
                <div role="separator" className="my-1 h-px bg-border" />
                {prototype.versions.length > 1 ? (
                  <button type="button" role="menuitem" onClick={() => choose("delete")} className={`${menuItem} text-destructive`}>
                    <TrashIcon />
                    Delete {version}
                  </button>
                ) : null}
                <button type="button" role="menuitem" onClick={() => choose("archive")} className={`${menuItem} text-destructive`}>
                  <ArchiveIcon />
                  Archive
                </button>
              </>
            )}
            {deletable ? (
              <>
                {prototype.archived ? <div role="separator" className="my-1 h-px bg-border" /> : null}
                <button type="button" role="menuitem" onClick={() => choose("delete-prototype")} className={`${menuItem} text-destructive`}>
                  <TrashIcon />
                  Delete prototype
                </button>
              </>
            ) : null}
          </div>
        )}
      </MotionPopover>

      {dialog === "rename" ? <RenameDialog prototype={prototype} onClose={() => setDialog(null)} /> : null}
      {dialog === "delete" ? <DeleteVersionDialog prototype={prototype} version={version} onClose={() => setDialog(null)} /> : null}
      {dialog === "archive" ? <ArchiveDialog prototype={prototype} onClose={() => setDialog(null)} /> : null}
      {dialog === "delete-prototype" ? <DeletePrototypeDialog prototype={prototype} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
