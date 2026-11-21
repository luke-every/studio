"use client";

import { useEffect, useRef, useState } from "react";

import { PlusIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { TERMINAL_HOST, useStarts, type Starts } from "@/lib/terminal";

/** Putting a template into a project that has none, through the helper on this machine. */
export type AddTemplate = {
  templates: Starts["templates"];
  busy: boolean;
  add: (template: string) => void;
};

/**
 * What a project can start from, and the making of it: the helper scaffolds the template into the project's own folder
 * (the same script as a new prototype) and the page is loaded again once it is done, on its canvas, as the prototype it has become.
 * Null where it can't be done: not on this machine, or the helper isn't running, or the page already has a prototype.
 */
export function useAddTemplate(slug: string, enabled: boolean, onProblem: (message: string) => void): AddTemplate | null {
  const starts = useStarts();
  const [busy, setBusy] = useState(false);

  if (!enabled || !starts) return null;
  return {
    templates: starts.templates,
    busy,
    add: (template) => {
      if (busy) return;
      setBusy(true);
      const socket = new WebSocket(`ws://${TERMINAL_HOST}/new?${new URLSearchParams({ kind: "template", slug, template })}`);
      let settled = false;
      const fail = (reason: string) => {
        settled = true;
        socket.close();
        setBusy(false);
        onProblem(reason);
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as { error?: string; done?: { slug: string } };
        if (message.error) fail(message.error);
        if (message.done) {
          settled = true;
          // The page is loaded again as the prototype it has become, and the link opens its canvas, where it was.
          window.location.assign(`${window.location.pathname}?canvas=1`);
        }
      };
      socket.onclose = () => {
        if (!settled) fail("Lost the connection to the helper on this machine. Check that it is running, then try again.");
      };
    },
  };
}

/** The list of templates, in the same rows as the New dialog. Opens above the plus and closes on a pick, a click away or Escape. */
function Menu({ addTemplate, onClose }: { addTemplate: AddTemplate; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (event: PointerEvent) => !root.current?.parentElement?.contains(event.target as Node) && onClose();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", escape, true);
    };
  }, [onClose]);
  return (
    <div ref={root} role="menu" className="absolute z-[var(--z-popover)] bottom-full right-0 mb-3 flex w-64 flex-col gap-0.5 rounded-[var(--r-tile)] border border-border bg-surface-elevated p-1 shadow-floating">
      {addTemplate.templates.map((item) => (
        <button
          key={item.name}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            addTemplate.add(item.name);
          }}
          className="flex flex-col gap-0.5 rounded-[var(--r-control)] px-3 py-2 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset"
        >
          <span className="text-xs font-medium text-foreground">{item.name}</span>
          {item.about ? <span className="line-clamp-2 text-xs text-foreground-subtle">{item.about}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** The plus at the far end of the canvas's bar: the templates open above it. */
export function AddTemplateButton({ addTemplate }: { addTemplate: AddTemplate }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center">
      <IconButton tooltipSide="above" label="Add a template" variant="ghost" aria-haspopup="menu" aria-expanded={open} loading={addTemplate.busy} disabled={addTemplate.busy} onClick={() => setOpen((now) => !now)}>
        <PlusIcon className="size-[1.125rem]" />
      </IconButton>
      {open ? <Menu addTemplate={addTemplate} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
