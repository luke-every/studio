"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import type { Part } from "@/lib/edit-part";
import { childrenIn } from "@/lib/page-tree";
import { selectionLine } from "@/lib/selection-line";

import { PinTarget } from "./comment-parts";
import { followPart, pageOf } from "./frame-page";
import { useGlass } from "./use-glass";

/** An element chosen to tell Claude about: what it is on the page, how to say so (`line`), a short name for the chip, and a count of choices so choosing the same one again is a new one. */
export type Selected = { part: Part; line: string; chip: string; n: number };

/**
 * Choosing an element in the prototype for Claude. While `picking`, a sheet of glass over the prototype outlines what is
 * under the pointer and a click chooses it, the way edit mode does (the page is asked what is there, so a live version on
 * its own address works the same); arrow up and down move the choice to what holds it or what it holds, and Escape ends
 * picking. The choice is outlined afterwards too, with the prototype usable again, and breathes while Claude is working.
 */
export function SelectLayer({
  frame,
  scale,
  picking,
  selected,
  pulse,
  onSelect,
  onExit,
}: {
  frame: RefObject<HTMLIFrameElement | null>;
  scale: number;
  picking: boolean;
  selected: Selected | null;
  pulse: boolean;
  onSelect: (selected: Selected) => void;
  onExit: () => void;
}) {
  const { target, point, glass } = useGlass(frame, scale, picking);
  const count = useRef(0);

  const choose = async (part: Part) => {
    const element = frame.current;
    if (!element) return;
    const tree = await pageOf(element).tree();
    onSelect({ part, ...selectionLine(tree, part.selector, part.tag, part.inside ?? part.component?.name), n: ++count.current });
  };

  // Where the choice is now, as its page says (a live version tells us whenever it moves; a page the studio can read is looked at).
  const selector = selected?.part.selector;
  const [seen, setSeen] = useState<{ selector: string; box: Part["box"] | null } | null>(null);
  useEffect(() => {
    const element = frame.current;
    if (!element || !selector) return undefined;
    if (!element.contentDocument) return followPart(element, selector, (heard) => setSeen({ selector, box: heard?.box ?? null }));
    const look = () => void pageOf(element).boxOf(selector).then((box) => setSeen({ selector, box }));
    look();
    const timer = window.setInterval(look, 200);
    return () => window.clearInterval(timer);
  }, [frame, selector]);
  const box = selected ? (seen && seen.selector === selector ? seen.box : selected.part.box) : null;

  // Arrow up: what holds it. Arrow down: its first child. Not while words are being typed anywhere (the terminal's cursor is in one).
  const current = useRef(selected);
  useEffect(() => {
    current.current = selected;
  });
  useEffect(() => {
    if (!picking) return undefined;
    const move = async (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      if (event.key === "Escape") return onExit();
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      const now = current.current;
      const element = frame.current;
      if (!now || !element) return;
      event.preventDefault();
      const page = pageOf(element);
      const tree = await page.tree();
      const at = tree?.selector.indexOf(now.part.selector) ?? -1;
      if (!tree || at < 0) return;
      const next = event.key === "ArrowUp" ? tree.parent[at] : childrenIn(tree, at)[0];
      if (next === undefined || next < 0) return;
      const part = await page.partOf(tree.selector[next]);
      if (part) void choose(part);
    };
    window.addEventListener("keydown", move);
    return () => window.removeEventListener("keydown", move);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `choose` only reads refs and the callbacks, which are current each time it is called
  }, [picking, frame]);

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: "var(--z-raised)" }}>
      {picking ? (
        <div
          ref={glass}
          // A click on the glass never reaches the tile around the prototype, which would let go of what was chosen.
          onClick={async (event) => {
            event.stopPropagation();
            const element = frame.current;
            if (!element) return;
            const area = event.currentTarget.getBoundingClientRect();
            const found = await pageOf(element).partAt((event.clientX - area.left) / scale, (event.clientY - area.top) / scale);
            if (found) void choose(found);
          }}
          onPointerMove={(event) => {
            const area = event.currentTarget.getBoundingClientRect();
            point(event.clientX - area.left, event.clientY - area.top);
          }}
          onPointerLeave={() => point(null)}
          className="pointer-events-auto absolute inset-0"
        />
      ) : null}
      {box ? <PinTarget strong pulse={pulse} left={box.left * scale} top={box.top * scale} width={box.width * scale} height={box.height * scale} component={!!(selected?.part.component || selected?.part.inside)} /> : null}
      {picking && target ? <PinTarget left={target.left * scale} top={target.top * scale} width={target.width * scale} height={target.height * scale} component={target.component} /> : null}
    </div>
  );
}
