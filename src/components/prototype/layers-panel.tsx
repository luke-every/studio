"use client";

import { useEffect, useRef, useState } from "react";

import { deviceIcons } from "@/components/prototype/view-menu";
import {
  BoxIcon,
  ButtonIcon,
  ChevronDownIcon,
  ComponentIcon,
  EyeIcon,
  ArrowIcon,
  EllipseIcon,
  PolygonIcon,
  StarIcon,
  EyeOffIcon,
  LineIcon,
  PenIcon,
  StickyIcon,
  RectangleIcon,
  FrameIcon,
  HeadingIcon,
  ImageIcon,
  InputIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  UnlockIcon,
  TextIcon,
} from "@/components/shell/nav-icons";

export type LayerRow = {
  /** A frame's id, or a screen's or piece's copy key. */
  id: string;
  kind: "frame" | "text" | "image" | "component" | "screen" | "node";
  name: string;
  depth: number;
  /** A frame with something in it can be folded. */
  expandable?: boolean;
  open?: boolean;
  selected: boolean;
  /** Inside a selected layer: shown as part of the selection. */
  within?: boolean;
  /** The pointer is over what it stands for, on the canvas. */
  hovered?: boolean;
  /** A frame drawn with a shape tool: it has that shape's icon. */
  shape?: "rectangle" | "ellipse" | "line" | "arrow" | "polygon" | "star" | "path" | "sticky";
  /** For a screen: the device it is drawn on, which gives its icon. */
  device?: string;
  hidden?: boolean;
  locked?: boolean;
  /** Can be renamed, hidden, locked and moved: what is on the canvas, not the prototype's own screens or the elements of a page. */
  own?: boolean;
  /** For an element of a screen: which screen's copy it is in, and its number there. */
  copy?: string;
  ix?: number;
};

const byTag: Record<string, typeof BoxIcon> = {
  h1: HeadingIcon,
  h2: HeadingIcon,
  h3: HeadingIcon,
  h4: HeadingIcon,
  h5: HeadingIcon,
  h6: HeadingIcon,
  p: TextIcon,
  span: TextIcon,
  label: TextIcon,
  strong: TextIcon,
  em: TextIcon,
  small: TextIcon,
  blockquote: TextIcon,
  img: ImageIcon,
  svg: ImageIcon,
  picture: ImageIcon,
  video: ImageIcon,
  canvas: ImageIcon,
  button: ButtonIcon,
  summary: ButtonIcon,
  input: InputIcon,
  textarea: InputIcon,
  select: InputIcon,
  ul: ListIcon,
  ol: ListIcon,
  li: ListIcon,
  dl: ListIcon,
  a: LinkIcon,
};

/** Each kind of layer has its own icon; an element of a page has the one for its tag, a plain box when it is only a container. */
const iconOf = (row: LayerRow) => {
  const Icon =
    row.kind === "node"
      ? (byTag[row.name.split(/\s/)[0]] ?? BoxIcon)
      : row.kind === "frame"
        ? row.shape === "rectangle" ? RectangleIcon : row.shape === "ellipse" ? EllipseIcon : row.shape === "line" ? LineIcon : row.shape === "arrow" ? ArrowIcon : row.shape === "polygon" ? PolygonIcon : row.shape === "star" ? StarIcon : row.shape === "path" ? PenIcon : row.shape === "sticky" ? StickyIcon : FrameIcon
        : row.kind === "text"
          ? TextIcon
          : row.kind === "image"
            ? ImageIcon
            : row.kind === "component"
              ? ComponentIcon
              : (row.device && deviceIcons[row.device]) || FrameIcon;
  return <Icon className={`size-4 shrink-0 ${row.kind === "component" ? "text-[var(--component)]" : "text-foreground-muted"}`} />;
};

/** What is on the canvas as a tree, as in Figma: frames with what is in them beneath, then what is on its own, then the prototype's screens. */
export function LayersPanel({
  rows,
  onSelect,
  onFold,
  onRename,
  onToggle,
  onMove,
  onHover,
}: {
  rows: LayerRow[];
  onRename: (row: LayerRow, name: string) => void;
  /** The pointer is over a row (or has left them all: null): what it stands for is outlined on the canvas. */
  onHover: (row: LayerRow | null) => void;
  onToggle: (row: LayerRow, what: "hidden" | "locked") => void;
  /** Dragged to another place: above or below `target` (in the same frame as it), or into it when it is a frame. */
  onMove: (drag: LayerRow, target: LayerRow, where: "before" | "after" | "into") => void;
  onSelect: (row: LayerRow, shift: boolean) => void;
  onFold: (row: LayerRow, all: boolean) => void;
}) {
  // The canvas takes every wheel for panning and zooming; over this panel the wheel is the list's own, to scroll it as far as it goes either way.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    const keep = (event: WheelEvent) => event.stopPropagation();
    element?.addEventListener("wheel", keep);
    return () => element?.removeEventListener("wheel", keep);
  }, []);
  const [renaming, setRenaming] = useState<string | null>(null);
  const dragging = useRef<LayerRow | null>(null);
  const [over, setOver] = useState<{ key: string; where: "before" | "after" | "into" } | null>(null);
  const keyOf = (row: LayerRow) => `${row.kind}-${row.id}-${row.ix ?? ""}`;
  // Whatever is selected is brought into view, at once: from the canvas it may be deep in the tree, or only just opened.
  const shown = rows.filter((row) => row.selected).map((row) => `${row.kind}-${row.id}-${row.ix ?? ""}`).join(" ");
  useEffect(() => {
    if (shown) root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }, [shown]);
  return (
    <div ref={root} className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto py-1 [scrollbar-width:thin]">
        <ul role="tree" aria-label="Layers" className="w-max min-w-full">
          {rows.map((row) => (
            <li
              key={`${row.kind}-${row.id}-${row.ix ?? ""}`}
              role="treeitem"
              aria-selected={row.selected}
              aria-expanded={row.expandable ? row.open : undefined}
            >
              <div
                style={{ paddingLeft: 4 + row.depth * 16 }}
                draggable={row.own && renaming !== keyOf(row)}
                onDragStart={(event) => {
                  dragging.current = row;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", row.name);
                }}
                onDragEnd={() => {
                  dragging.current = null;
                  setOver(null);
                }}
                onDragOver={(event) => {
                  const from = dragging.current;
                  if (!from || !row.own || from === row) return;
                  event.preventDefault();
                  const box = event.currentTarget.getBoundingClientRect();
                  const at = (event.clientY - box.top) / box.height;
                  const where = row.kind === "frame" && at > 0.25 && at < 0.75 ? "into" : at < 0.5 ? "before" : "after";
                  setOver((now) => (now?.key === keyOf(row) && now.where === where ? now : { key: keyOf(row), where }));
                }}
                onMouseEnter={() => onHover(row)}
                onMouseLeave={() => onHover(null)}
                onDragLeave={() => setOver((now) => (now?.key === keyOf(row) ? null : now))}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = dragging.current;
                  if (from && over && over.key === keyOf(row)) onMove(from, row, over.where);
                  dragging.current = null;
                  setOver(null);
                }}
                className={`group relative flex h-7 items-center gap-1 pr-2 text-xs transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${row.hidden ? "opacity-50" : ""} ${row.selected ? (row.kind === "component" ? "bg-[var(--component-muted)]" : "bg-[var(--selection-muted)]") + " text-foreground" : row.within ? "bg-[color-mix(in_srgb,var(--selection-muted)_45%,transparent)] text-foreground hover:bg-[color-mix(in_srgb,var(--selection-muted)_75%,transparent)]" : row.hovered ? "bg-surface-inset text-foreground" : "text-foreground-muted hover:bg-surface-inset hover:text-foreground"} ${over?.key === keyOf(row) ? (over.where === "into" ? "outline outline-1 -outline-offset-1 outline-[var(--selection)]" : over.where === "before" ? "shadow-[inset_0_1px_0_var(--selection)]" : "shadow-[inset_0_-1px_0_var(--selection)]") : ""}`}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={row.open ? "Fold" : "Unfold"}
                  onClick={(event) => row.expandable && onFold(row, event.altKey)}
                  className={`grid size-4 shrink-0 place-items-center ${row.expandable ? "" : "invisible"}`}
                >
                  <ChevronDownIcon className={`size-3 transition-transform duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${row.open ? "" : "-rotate-90"}`} />
                </button>
                {renaming === keyOf(row) ? (
                  <span className="flex flex-1 items-center gap-1.5">
                    {iconOf(row)}
                    <input
                      autoFocus
                      aria-label="Layer name"
                      defaultValue={row.name}
                      onFocus={(event) => event.target.select()}
                      onBlur={(event) => {
                        const name = event.target.value.trim();
                        if (name && name !== row.name) onRename(row, name);
                        setRenaming(null);
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") {
                          event.currentTarget.value = row.name;
                          event.currentTarget.blur();
                        }
                      }}
                      className="h-5 min-w-24 flex-1 rounded-[var(--r-xs)] bg-surface px-1 text-xs text-foreground outline-none ring-1 ring-[var(--selection)]"
                    />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => onSelect(row, event.shiftKey)}
                    onDoubleClick={() => row.own && row.kind !== "text" && setRenaming(keyOf(row))}
                    className="flex flex-1 items-center gap-1.5 whitespace-nowrap text-left"
                  >
                    {iconOf(row)}
                    <span className="whitespace-nowrap">{row.name}</span>
                  </button>
                )}
                {row.own ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={row.locked ? "Unlock" : "Lock"}
                      onClick={() => onToggle(row, "locked")}
                      className={`grid size-5 place-items-center rounded-[var(--r-xs)] hover:text-foreground ${row.locked ? "" : "invisible group-hover:visible"}`}
                    >
                      {row.locked ? <LockIcon className="size-3.5" /> : <UnlockIcon className="size-3.5" />}
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={row.hidden ? "Show" : "Hide"}
                      onClick={() => onToggle(row, "hidden")}
                      className={`grid size-5 place-items-center rounded-[var(--r-xs)] hover:text-foreground ${row.hidden ? "" : "invisible group-hover:visible"}`}
                    >
                      {row.hidden ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                    </button>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
