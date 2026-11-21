"use client";

import { Fragment, useMemo, useState, type DragEvent } from "react";

import { SearchIcon } from "@/components/shell/nav-icons";
import { useCatalogue, type CatalogueItem } from "@/lib/use-catalogue";
import { useProjectForks, type ProjectFork } from "@/lib/use-forks";

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
export function ComponentsPanel({ open, slug }: { open: boolean; slug?: string }) {
  const catalogue = useCatalogue(open);
  const [query, setQuery] = useState("");
  // The copies this project has made sit under the component each is a copy of, indented, and say so. Dragged out, one is an instance of the copy.
  const forks = useProjectForks(slug, open);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shownForks = forks.filter((fork) => words.every((word) => `${fork.label} forked`.toLowerCase().includes(word)));

  const shown = useMemo(() => {
    const found = (catalogue?.items ?? []).filter((item) => words.every((word) => `${item.label} ${item.group}`.toLowerCase().includes(word)));
    // Those with a picture first: they are what is being looked for.
    return found.sort((a, b) => Number(!a.file) - Number(!b.file) || a.label.localeCompare(b.label));
  }, [catalogue, query]);
  const forksOf = (id: string) => shownForks.filter((fork) => fork.id === id);
  // Those whose component isn't in the list shown (the search found the copy and not the component) come after, so they can still be reached.
  const loose = shownForks.filter((fork) => !shown.some((item) => item.id === fork.id));
  const dragForkFrom = (fork: ProjectFork) => {
    const original = catalogue?.items.find((item) => item.id === fork.id);
    return { id: fork.id, title: original?.title ?? fork.label, label: `${fork.label} fork`, width: original?.width, height: original?.height, fork: fork.label };
  };
  // Without pictures (the stage lists what it can draw, not how it looks) the components are rows under their group, the groups in the order the stage gives them.
  const rowsOnly = !!catalogue?.items.length && catalogue.items.every((item) => !item.file);
  const groups = useMemo(() => {
    const order = [...new Set((catalogue?.items ?? []).map((item) => item.group))];
    const by = new Map<string, CatalogueItem[]>();
    for (const item of shown) by.set(item.group, [...(by.get(item.group) ?? []), item]);
    return [...by].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [catalogue, shown]);

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
          <p className="text-xs text-foreground-muted">{catalogue.stopped ? "The stage isn't built. Run npm run studio in ~/Claude/prototypes/stage." : "No components yet."}</p>
        ) : !shown.length ? (
          <p className="text-xs text-foreground-muted">No component matches &ldquo;{query.trim()}&rdquo;. Try a shorter word.</p>
        ) : rowsOnly ? (
          <div className="flex flex-col gap-4">
            {groups.map(([group, items]) => (
              <section key={group} className="flex flex-col gap-1">
                <h3 className="text-xs text-foreground-muted">{group}</h3>
                <ul className="flex flex-col">
                  {items.map((item) => (
                    <Fragment key={item.id}>
                      <Row item={item} />
                      {forksOf(item.id).map((fork) => (
                        <ForkRow key={`fork-${fork.id}`} fork={fork} drag={dragForkFrom(fork)} />
                      ))}
                    </Fragment>
                  ))}
                </ul>
              </section>
            ))}
            {loose.length ? (
              <section className="flex flex-col gap-1">
                <h3 className="text-xs text-foreground-muted">Forked</h3>
                <ul className="flex flex-col">
                  {loose.map((fork) => (
                    <ForkRow key={`fork-${fork.id}`} fork={fork} drag={dragForkFrom(fork)} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-x-2 gap-y-4">
            {shown.map((item) => (
              <Tile key={item.id} item={item} base={`/api/catalogue/${catalogue.key}`} />
            ))}
            {shownForks.map((fork) => (
              <ForkRow key={`fork-${fork.id}`} fork={fork} drag={dragForkFrom(fork)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A copy this project made: its name, indented under the component it is a copy of, and marked as forked. Dragged out, it is an instance of the copy. */
function ForkRow({ fork, drag }: { fork: ProjectFork; drag: Record<string, unknown> }) {
  return (
    <li
      draggable
      onDragStart={(event: DragEvent<HTMLLIElement>) => {
        event.dataTransfer.setData(COMPONENT_DRAG_TYPE, JSON.stringify(drag));
        event.dataTransfer.setData("text/plain", String(drag.label));
        event.dataTransfer.effectAllowed = "copy";
      }}
      className="col-span-2 flex h-8 cursor-grab items-center gap-2 rounded-[var(--r-control)] pl-6 pr-2 text-xs text-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset"
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--fork)]" />
      <span className="truncate">{fork.label}</span>
      <span className="ml-auto shrink-0 text-foreground-muted">Forked</span>
    </li>
  );
}

/** One component with no picture: its name, to be dragged onto the canvas. */
function Row({ item }: { item: CatalogueItem }) {
  return (
    <li
      draggable
      onDragStart={(event: DragEvent<HTMLLIElement>) => {
        event.dataTransfer.setData(COMPONENT_DRAG_TYPE, JSON.stringify({ id: item.id, title: item.title, label: item.label, width: item.width, height: item.height }));
        event.dataTransfer.setData("text/plain", item.label);
        event.dataTransfer.effectAllowed = "copy";
      }}
      className="flex h-8 cursor-grab items-center rounded-[var(--r-control)] px-2 text-xs text-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset active:cursor-grabbing"
    >
      <span className="truncate">{item.label}</span>
    </li>
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
