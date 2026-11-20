"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { MotionModal } from "@/components/motion";
import { ChevronDownIcon, ImageIcon } from "@/components/shell/nav-icons";
import { Button, IconButton } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";
import { findAllImages, folderOf, makeImage, type FoundImage, type Format, type Made, type Scale, type ScreenToRead } from "@/lib/export-images";
import { listCopySections } from "@/lib/registry/actions";

const SCALES: Scale[] = [1, 2, 3];
const FORMATS: { id: Format; name: string }[] = [
  { id: "original", name: "Original" },
  { id: "png", name: "PNG" },
  { id: "webp", name: "WebP" },
  { id: "jpeg", name: "JPEG" },
];
const FORMAT_KEY = "export-images:format";
/** The format this browser exported in last, so it doesn't have to be chosen each time (per person, so kept here and not in the studio). */
const keptFormat = (): Format => {
  try {
    const kept = localStorage.getItem(FORMAT_KEY);
    return FORMATS.find((one) => one.id === kept)?.id ?? "original";
  } catch {
    return "original";
  }
};
/** What was found on each prototype's screens at each width, for as long as the page lives: opening the modal again reads nothing again. The screens' addresses carry the version, so a new push is a new key; Rescan is for the rest. */
const readBefore = new Map<string, { images: FoundImage[]; unreadable: number }>();
const chip = "inline-flex h-8 min-w-10 items-center justify-center rounded-[var(--r-control)] px-3 text-sm transition-colors duration-[var(--dur-fast)]";
const field = "h-8 rounded-[var(--r-control)] bg-surface-inset px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-[var(--focus-ring)]";

/**
 * Exports the prototype's pictures (see `lib/export-images.ts`): the ones on the screens in view, found and named for you, made at 2× unless another scale is
 * chosen, and put in a folder in the prototype's own folder, which opens in Finder. The list is organised as the folders are: variant, then section, each
 * section open or folded. Only on this machine, where that folder is.
 */
export function ExportImagesMenu({ slug, screens: screensOf, device, variant }: { slug: string; /** Every screen of the prototype, in the flow and in the variants, whichever the page is showing. */ screens: () => ScreenToRead[]; /** The device the screens are opened at. */ device: { width: number; height: number }; variant?: "ghost" }) {
  const { notify } = useStudio();
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<FoundImage[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [scales, setScales] = useState<Scale[]>([2]);
  const [format, setFormat] = useState<Format>(keptFormat);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [problem, setProblem] = useState("");
  const [scanned, setScanned] = useState(false);
  const [unreadable, setUnreadable] = useState(0);
  const [only, setOnly] = useState("");
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);

  const scan = async (again = false) => {
    setProblem("");
    setScanned(false);
    const list = screensOf();
    const key = `${slug}|${device.width}x${device.height}|${list.map((one) => one.src).join(",")}`;
    let all = again ? undefined : readBefore.get(key);
    if (!all) {
      const sections = await listCopySections(slug);
      setReading({ done: 0, total: list.length });
      all = await findAllImages(list, sections.ok ? sections.value : [], device, (done, total) => setReading({ done, total }));
      readBefore.set(key, all);
      setReading(null);
    }
    setUnreadable(all.unreadable);
    setFound(all.images);
    setOff(new Set());
    setFolded(new Set());
    setOnly("");
    setScanned(true);
  };
  const show = () => {
    setOpen(true);
    void scan();
  };

  // The variants (screens) there are, and what is shown of them: the list is organised as the folders are, variant then section.
  const variants = [...new Set(found.map((one) => one.screen).filter(Boolean))];
  const shown = only ? found.filter((one) => one.screen === only) : found;
  const chosen = shown.filter((one) => !off.has(one.id));
  const groups = shown.reduce<{ key: string; screen: string; section: string; images: FoundImage[] }[]>((all, one) => {
    const key = folderOf(one);
    const group = all.find((item) => item.key === key);
    if (group) group.images.push(one);
    else all.push({ key, screen: one.screen, section: one.section, images: [one] });
    return all;
  }, []);
  const setMany = (images: FoundImage[], on: boolean) =>
    setOff((now) => {
      const next = new Set(now);
      for (const one of images) {
        if (on) next.delete(one.id);
        else next.add(one.id);
      }
      return next;
    });
  const toggleScale = (scale: Scale) => setScales((now) => (now.includes(scale) ? (now.length > 1 ? now.filter((one) => one !== scale) : now) : [...now, scale].sort()));
  const toggleFold = (key: string) =>
    setFolded((now) => {
      const next = new Set(now);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const allFolded = !!groups.length && groups.every((group) => folded.has(group.key));

  const send = async () => {
    setProblem("");
    setBusy({ done: 0, total: chosen.length });
    const made: Made[] = [];
    let missed = 0;
    for (const image of chosen) {
      try {
        made.push(...(await makeImage(image, scales, format)));
      } catch {
        missed++;
      }
      setBusy((now) => now && { ...now, done: now.done + 1 });
    }
    if (!made.length) {
      setBusy(null);
      setProblem("None of the images could be read. Reload the page and try again.");
      return;
    }
    const form = new FormData();
    form.set("slug", slug);
    for (const file of made) {
      form.append("path", file.path);
      form.append("file", file.blob, file.path.split("/").pop());
    }
    const sent = await fetch("/api/export-images", { method: "POST", body: form }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>).catch(() => null);
    setBusy(null);
    if (!sent?.ok) return setProblem(sent?.error ?? "The studio couldn't be reached. Try again.");
    setOpen(false);
    notify(missed ? `Exported ${made.length} files. ${missed} couldn't be read.` : `Exported ${made.length} files`, !!missed);
  };

  const widest = Math.max(...scales);
  return (
    <>
      <IconButton label="Export images" variant={variant} tooltipSide="below" tooltipAlign="end" aria-haspopup="dialog" onClick={show}>
        <ImageIcon />
      </IconButton>
      {/* In the page itself rather than the canvas: the canvas takes the wheel for panning, and would not let the list scroll. */}
      {createPortal(
            <MotionModal open={open} onClose={() => (busy ? undefined : setOpen(false))} label="Export images" className="h-[44rem] !max-w-[40rem]">
              <div className="flex h-full flex-col gap-4">
                <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">Export images</h2>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex gap-1" role="group" aria-label="Scale">
                    {SCALES.map((scale) => (
                      <button key={scale} type="button" aria-pressed={scales.includes(scale)} onClick={() => toggleScale(scale)} className={`${chip} ${scales.includes(scale) ? "bg-accent text-accent-foreground" : "bg-surface-inset text-foreground-muted hover:text-foreground"}`}>
                        {scale}×
                      </button>
                    ))}
                  </span>
                  <select
                    aria-label="Format"
                    value={format}
                    onChange={(event) => {
                      const next = event.target.value as Format;
                      setFormat(next);
                      try {
                        localStorage.setItem(FORMAT_KEY, next);
                      } catch {}
                    }}
                    className={field}
                  >
                    {FORMATS.map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.name}
                      </option>
                    ))}
                  </select>
                  {variants.length > 1 ? (
                    <select aria-label="Variant" value={only} onChange={(event) => setOnly(event.target.value)} className={field}>
                      <option value="">All variants</option>
                      {variants.map((one) => (
                        <option key={one} value={one}>
                          {one}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>

                {!scanned ? (
                  <p className="pulse-soft flex-1 text-sm text-foreground-muted">{reading && reading.total > 1 ? `Looking at screen ${Math.min(reading.done + 1, reading.total)} of ${reading.total}` : "Looking for images"}</p>
                ) : !found.length ? (
                  <p className="flex-1 text-sm text-foreground-muted">
                    {unreadable ? "These screens didn't answer, so their images can't be read here. Push a version and open that one." : "No images in view. Open a screen that has some."}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3 border-b border-divider pb-2">
                      <label className="flex items-center gap-2 text-sm text-foreground-muted">
                        <input type="checkbox" checked={!!shown.length && chosen.length === shown.length} onChange={() => setMany(shown, chosen.length !== shown.length)} className="size-4 accent-[var(--accent)]" />
                        {chosen.length} of {shown.length} selected
                      </label>
                      <span className="flex items-center gap-3">
                        <button type="button" onClick={() => void scan(true)} className="text-sm text-foreground-muted hover:text-foreground">
                          Rescan
                        </button>
                        <button type="button" onClick={() => setFolded(allFolded ? new Set() : new Set(groups.map((group) => group.key)))} className="text-sm text-foreground-muted hover:text-foreground">
                          {allFolded ? "Expand all" : "Collapse all"}
                        </button>
                      </span>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
                      {groups.map((group, index) => (
                        <section key={group.key || "none"} className="flex flex-col gap-1">
                          {!only && variants.length > 1 && group.screen !== groups[index - 1]?.screen ? <h3 className="pt-1 text-sm font-medium text-foreground">{group.screen || "Other"}</h3> : null}
                          <div className="flex items-center gap-2">
                            <button type="button" aria-expanded={!folded.has(group.key)} aria-label={`${folded.has(group.key) ? "Expand" : "Collapse"} ${group.section || "images"}`} onClick={() => toggleFold(group.key)} className="flex size-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-foreground-muted hover:text-foreground">
                              <ChevronDownIcon className={`size-4 transition-transform duration-[var(--dur-fast)] ${folded.has(group.key) ? "-rotate-90" : ""}`} />
                            </button>
                            <label className="flex flex-1 items-center gap-2 text-sm text-foreground-muted">
                              <input type="checkbox" checked={group.images.every((one) => !off.has(one.id))} onChange={() => setMany(group.images, group.images.some((one) => off.has(one.id)))} className="size-4 shrink-0 accent-[var(--accent)]" />
                              {group.section || "No section"}
                              <span className="text-foreground-subtle">{group.images.length}</span>
                            </label>
                          </div>
                          {folded.has(group.key) ? null : (
                            <ul className="flex flex-col gap-1 pl-8">
                              {group.images.map((image) => (
                                <li key={image.id}>
                                  <label className="flex cursor-pointer items-center gap-3 rounded-[var(--r-control)] p-1.5 hover:bg-surface-inset">
                                    <input type="checkbox" checked={!off.has(image.id)} onChange={() => setMany([image], off.has(image.id))} className="size-4 shrink-0 accent-[var(--accent)]" />
                                    {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail of a file on any address */}
                                    <img src={image.src} alt="" className="size-10 shrink-0 rounded-[var(--r-sm)] bg-surface-inset object-contain" />
                                    <span className="flex min-w-0 flex-col">
                                      <span className="truncate text-sm text-foreground">{image.name}</span>
                                      <span className="truncate text-xs text-foreground-subtle">
                                        {image.width}×{image.height}
                                        {image.naturalWidth && image.naturalWidth < image.width * widest && !/\.svg$/i.test(new URL(image.src).pathname) ? ` · file is ${image.naturalWidth}px wide, scaled up` : ""}
                                      </span>
                                    </span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>
                      ))}
                    </div>
                  </>
                )}

                {problem ? (
                  <p role="alert" className="text-sm text-foreground">
                    {problem}
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <Button variant="primary" loading={!!busy} disabled={!chosen.length || !!busy} onClick={() => void send()}>
                    {busy ? `Exporting ${Math.min(busy.done + 1, busy.total)} of ${busy.total}` : `Export ${chosen.length} ${chosen.length === 1 ? "image" : "images"}`}
                  </Button>
                </div>
              </div>
            </MotionModal>,
            document.body,
          )}
    </>
  );
}
