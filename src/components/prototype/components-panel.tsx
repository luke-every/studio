"use client";

import { useMemo, useState, type DragEvent } from "react";

import { SearchIcon } from "@/components/shell/nav-icons";
import { useCatalogue, type CatalogueItem } from "@/lib/use-catalogue";

/** The panel reads pictures kept on this machine, so like Storybook it is for the studio running locally only. */
export const SHOW_COMPONENTS = process.env.NODE_ENV === "development";

/** What a component carries while it is dragged, for whatever it is dropped on to read. */
export const COMPONENT_DRAG_TYPE = "application/x-studio-component";

/** The widest a dragged picture is drawn: a full-width section at its own size would cover the screen. */
const GHOST_MAX = 480;

/**
 * The website's components, each as a small picture, to pick from. The pictures are made ahead of time
 * (scripts/build-catalogue.mjs) and cached by the browser, so opening this renders nothing and asks for nothing the
 * browser doesn't already have. A picture has a clear background on purpose: dragged out, it follows the cursor as
 * the component itself, at its own size.
 */
export function ComponentsPanel({ open }: { open: boolean }) {
  const catalogue = useCatalogue(open);
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const found = (catalogue?.items ?? []).filter((item) => words.every((word) => `${item.label} ${item.group}`.toLowerCase().includes(word)));
    // Those with a picture first: they are what is being looked for.
    return found.sort((a, b) => Number(!a.file) - Number(!b.file) || a.label.localeCompare(b.label));
  }, [catalogue, query]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[var(--r-control)] border border-border bg-surface shadow-[var(--elev-overlay)]">
      <div className="flex flex-col gap-3 p-4 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">Components</h2>
          {catalogue?.items.length ? <span className="text-xs text-foreground-muted">{catalogue.items.length}</span> : null}
        </div>
        <label className="flex h-9 items-center gap-2 rounded-[var(--r-control)] border border-border bg-surface px-3 text-foreground-muted focus-within:border-foreground-subtle">
          <SearchIcon className="size-4 shrink-0" />
          <input
            type="search"
            aria-label="Search components"
            placeholder="Search components…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-foreground-muted"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 [scrollbar-width:thin]">
        {!catalogue ? (
          <ul aria-hidden className="grid grid-cols-2 gap-x-2 gap-y-4">
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index} className="flex flex-col gap-1">
                <span className="h-4 w-16 animate-pulse rounded-[var(--r-xs)] bg-surface-inset" />
                <span className="h-24 animate-pulse rounded-[var(--r-md)] bg-surface-inset" />
              </li>
            ))}
          </ul>
        ) : !catalogue.items.length ? (
          <p className="text-xs text-foreground-muted">No previews yet. Run node scripts/build-catalogue.mjs in the studio&apos;s folder to make them.</p>
        ) : !shown.length ? (
          <p className="text-xs text-foreground-muted">No component matches &ldquo;{query.trim()}&rdquo;. Try a shorter word.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-2 gap-y-4">
            {shown.map((item) => (
              <Tile key={item.id} item={item} base={`/api/catalogue/${catalogue.key}`} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One component: its name above a well with its picture. Offscreen ones aren't laid out until they are scrolled near. */
function Tile({ item, base }: { item: CatalogueItem; base: string }) {
  const picture = item.file ? `${base}/${item.file}` : null;

  const grab = (event: DragEvent<HTMLLIElement>) => {
    event.dataTransfer.setData(COMPONENT_DRAG_TYPE, JSON.stringify({ id: item.id, title: item.title, label: item.label, width: item.width, height: item.height }));
    event.dataTransfer.setData("text/plain", item.label);
    event.dataTransfer.effectAllowed = "copy";
    const small = event.currentTarget.querySelector("img");
    if (!small) return;
    // The picture at the component's own size, not the thumbnail: what follows the cursor is the component.
    const width = Math.min(item.width, GHOST_MAX);
    const height = (width * item.height) / item.width;
    const ghost = small.cloneNode() as HTMLImageElement;
    ghost.loading = "eager";
    Object.assign(ghost.style, { position: "fixed", top: "-10000px", left: "-10000px", width: `${width}px`, height: `${height}px`, maxWidth: "none", maxHeight: "none" });
    document.body.appendChild(ghost);
    // Not yet decoded: the thumbnail will do, rather than a ghost with nothing in it.
    if (ghost.complete) event.dataTransfer.setDragImage(ghost, width / 2, height / 2);
    else event.dataTransfer.setDragImage(small, small.width / 2, small.height / 2);
    requestAnimationFrame(() => ghost.remove());
  };

  return (
    <li draggable onDragStart={grab} className="flex min-w-0 flex-col gap-1 [contain-intrinsic-size:auto_128px] [content-visibility:auto]">
      <span title={item.group ? `${item.group} / ${item.label}` : item.label} className="truncate text-xs text-foreground">
        {item.label}
      </span>
      <span className={`grid h-24 place-items-center overflow-hidden rounded-[var(--r-md)] bg-surface-inset p-2 cursor-grab active:cursor-grabbing`}>
        {picture ? (
          // Drawn at its own shape inside the well; the well, not the picture, is the grey.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt="" width={item.width} height={item.height} loading="lazy" decoding="async" draggable={false} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-foreground-muted">No preview</span>
        )}
      </span>
    </li>
  );
}
