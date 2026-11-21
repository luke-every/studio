"use client";

import { useRef, useState } from "react";

import { IconButton } from "@/components/ui/button";
import { PlusIcon, AlignBottomIcon, EyeIcon, EyeOffIcon, AlignCenterXIcon, AlignLeftIcon, AlignMiddleIcon, AlignRightIcon, AlignTopIcon, DistributeXIcon, DistributeYIcon } from "@/components/shell/nav-icons";
import { TokenColourField } from "@/components/prototype/colour-picker";
import { Check, Choice, ColorField, Field, FLOW_OPTIONS, Glyph, NumberField, PanelButton, PanelTitle, PresetMenu, Row, SelectField, Section, SizeField } from "@/components/prototype/edit-fields";
import { SPACING } from "@/lib/canvas-layout";
import { copiedFill } from "@/lib/canvas-clipboard";
import { toHex } from "@/lib/edit-dom";
import { fillsOf, type CanvasFrame, type FillLayer } from "@/lib/canvas-saved";

type Mode = "fixed" | "hug" | "fill";
/** How a frame lays out what is in it: nothing (freeform: things stay where they were put), or a row or a column. */
const flowOf = (frame: CanvasFrame): "freeform" | "row" | "column" | "grid" => frame.layout?.direction ?? "freeform";
const sizingOptions = (modes: Mode[]) => modes.map((mode) => ({ value: mode, label: mode === "fixed" ? "Fixed" : mode === "hug" ? "Hug" : "Fill" }));
export type AlignMode = "left" | "centerX" | "right" | "top" | "middle" | "bottom" | "spreadX" | "spreadY";
const ALIGNS: { mode: AlignMode; label: string; icon: React.ReactNode }[] = [
  { mode: "left", label: "Align left", icon: <AlignLeftIcon /> },
  { mode: "centerX", label: "Align centre", icon: <AlignCenterXIcon /> },
  { mode: "right", label: "Align right", icon: <AlignRightIcon /> },
  { mode: "top", label: "Align top", icon: <AlignTopIcon /> },
  { mode: "middle", label: "Align middle", icon: <AlignMiddleIcon /> },
  { mode: "bottom", label: "Align bottom", icon: <AlignBottomIcon /> },
];
const SPREADS: { mode: AlignMode; label: string; icon: React.ReactNode }[] = [
  { mode: "spreadX", label: "Distribute horizontally", icon: <DistributeXIcon /> },
  { mode: "spreadY", label: "Distribute vertically", icon: <DistributeYIcon /> },
];

/** Lines what is selected up with each other (or, when it is one layer in a frame, with the frame), and spreads three or more evenly. */
export function AlignRow({ onAlign, spread }: { onAlign: (mode: AlignMode) => void; spread: boolean }) {
  const button = ({ mode, label, icon }: (typeof ALIGNS)[number]) => (
    <button
      key={mode}
      type="button"
      aria-label={label}
      title={label}
      onClick={() => onAlign(mode)}
      className="grid size-7 place-items-center rounded-[var(--r-control)] text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset hover:text-foreground"
    >
      {icon}
    </button>
  );
  return (
    <div role="group" aria-label="Align" className="flex items-center gap-0.5 border-b border-divider px-3 py-2">
      {ALIGNS.map(button)}
      {spread ? (
        <>
          <span aria-hidden className="mx-1 h-4 w-px bg-divider" />
          {SPREADS.map(button)}
        </>
      ) : null}
    </div>
  );
}

/** Alignment as Figma lays it out: the three horizontal ones in a group and the three vertical ones in another, side by side. */
export function AlignFields({ onAlign, spread = false }: { onAlign: (mode: AlignMode) => void; spread?: boolean }) {
  const group = (items: { mode: AlignMode; label: string; icon: React.ReactNode }[], label: string) => (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-[var(--r-md)] bg-surface-inset p-0.5">
      {items.map(({ mode, label: title, icon }) => (
        <button
          key={mode}
          type="button"
          aria-label={title}
          title={title}
          onClick={() => onAlign(mode)}
          className="grid size-6 place-items-center rounded-[var(--r-sm)] text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface hover:text-foreground"
        >
          {icon}
        </button>
      ))}
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      {group(ALIGNS.slice(0, 3), "Align horizontally")}
      {group(ALIGNS.slice(3), "Align vertically")}
      {spread ? group(SPREADS, "Distribute") : null}
    </div>
  );
}

/** What each layer of a selection says about itself, in the pixels the single panels show: the panel finds what they share. */
export type MultiTarget = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Absent when it has no corners to round. */
  radius?: number;
  opacity: number;
  /** One plain colour; `undefined` for none; `null` for something that is not one colour (a picture, several fills). */
  fill?: string | null;
  stroke?: string;
  strokeWidth: number;
};
/** A change made to all of them: only what was asked for. `fill: null` takes the fill off. */
export type MultiPatch = { x?: number; y?: number; width?: number; height?: number; radius?: number; opacity?: number; fill?: string | null; stroke?: { color: string | undefined; width: number | undefined } };

/**
 * Several layers selected together, as one panel: what they all have the same is shown as it is and changed on all of them at once; what differs says "Mixed"
 * and a value typed replaces it on every one. A fill or stroke that is not the same on all says so, and a plus replaces it on all of them.
 */
export function MultiPanel({ targets, onAlign, onChange }: { targets: MultiTarget[]; onAlign: (mode: AlignMode) => void; onChange: (patch: MultiPatch) => void }) {
  const first = targets[0];
  const differs = (pick: (one: MultiTarget) => unknown) => targets.some((one) => pick(one) !== pick(first));
  const roundable = targets.every((one) => one.radius !== undefined);
  const fills = targets.map((one) => one.fill);
  const sameFill = fills.every((one) => one !== null && one === fills[0]);
  const strokes = targets.map((one) => (one.stroke ? `${one.stroke}|${one.strokeWidth}` : ""));
  const sameStroke = strokes.every((one) => one === strokes[0]);
  const plus = (label: string, onClick: () => void) => (
    <PanelButton label={label} onClick={onClick}>
      +
    </PanelButton>
  );
  return (
    <div className="flex min-h-full flex-col">
      <PanelTitle name={`${targets.length} layers`} />
      <Section title="Position">
        <Field caption="Alignment">
          <AlignFields onAlign={onAlign} spread={targets.length > 2} />
        </Field>
        <Field caption="Position">
          <Row>
            <NumberField glyph={<span className="text-xs">X</span>} label="X" value={px(first.x)} mixed={differs((one) => one.x)} onCommit={(css) => onChange({ x: number(css) })} />
            <NumberField glyph={<span className="text-xs">Y</span>} label="Y" value={px(first.y)} mixed={differs((one) => one.y)} onCommit={(css) => onChange({ y: number(css) })} />
          </Row>
        </Field>
      </Section>
      <Section title="Layout">
        <Field caption="Resizing">
          <Row>
            <NumberField glyph={<span className="text-xs">W</span>} label="Width" value={px(first.width)} mixed={differs((one) => one.width)} onCommit={(css) => onChange({ width: Math.max(8, number(css)) })} />
            <NumberField glyph={<span className="text-xs">H</span>} label="Height" value={px(first.height)} mixed={differs((one) => one.height)} onCommit={(css) => onChange({ height: Math.max(8, number(css)) })} />
          </Row>
        </Field>
      </Section>
      <Section title="Appearance">
        <Row>
          <NumberField unit="opacity" glyph={<Glyph><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M2.5 9 9 2.5M2.5 13.5 13.5 2.5M7 13.5l6.5-6.5" /></Glyph>} label="Opacity" caption="Opacity" value={String(first.opacity)} mixed={differs((one) => one.opacity)} onCommit={(css) => onChange({ opacity: Number(css) })} />
          {roundable ? (
            <NumberField glyph={<Glyph><path d="M2.5 6V4.5a2 2 0 0 1 2-2H6M10 2.5h1.5a2 2 0 0 1 2 2V6M13.5 10v1.5a2 2 0 0 1-2 2H10M6 13.5H4.5a2 2 0 0 1-2-2V10" /></Glyph>} label="Corner radius" caption="Corner radius" value={px(first.radius ?? 0)} mixed={differs((one) => one.radius)} onCommit={(css) => onChange({ radius: Math.max(0, number(css)) })} />
          ) : null}
        </Row>
      </Section>
      {sameFill && fills[0] === undefined ? (
        <Section title="Fill" applied={false} onAdd={() => onChange({ fill: "#d9d9d9" })} />
      ) : sameFill ? (
        <Section title="Fill" action={<PanelButton label="Remove fill" onClick={() => onChange({ fill: null })}>−</PanelButton>}>
          <TokenColourField label="Fill" value={asRgb(String(fills[0]))} onCommit={(css) => onChange({ fill: css })} />
        </Section>
      ) : (
        <Section title="Fill" action={plus("Replace the fills", () => onChange({ fill: "#d9d9d9" }))}>
          <p className="text-sm text-foreground-muted">Click + to replace mixed content</p>
        </Section>
      )}
      {sameStroke && !strokes[0] ? (
        <Section title="Stroke" applied={false} onAdd={() => onChange({ stroke: { color: "#000000", width: 1 } })} />
      ) : sameStroke ? (
        <Section title="Stroke" action={<PanelButton label="Remove stroke" onClick={() => onChange({ stroke: { color: undefined, width: undefined } })}>−</PanelButton>}>
          <Row>
            <TokenColourField label="Stroke" caption="Colour" value={asRgb(String(first.stroke))} onCommit={(css) => onChange({ stroke: { color: css, width: first.strokeWidth } })} />
            <NumberField glyph={<span className="text-xs">W</span>} label="Stroke width" caption="Width" value={px(first.strokeWidth)} onCommit={(css) => onChange({ stroke: { color: first.stroke, width: Math.max(0, number(css)) } })} />
          </Row>
        </Section>
      ) : (
        <Section title="Stroke" action={plus("Replace the strokes", () => onChange({ stroke: { color: "#000000", width: 1 } }))}>
          <p className="text-sm text-foreground-muted">Click + to replace mixed content</p>
        </Section>
      )}
      <Coming />
    </div>
  );
}

/** Several layers selected together. */
export function BunchPanel({ count, onAlign }: { count: number; onAlign: (mode: AlignMode) => void }) {
  return (
    <div className="flex min-h-full flex-col">
      <PanelTitle name={`${count} layers`} />
      <AlignRow onAlign={onAlign} spread={count > 2} />
    </div>
  );
}

/** A picture (a data address) as PNG, the one kind the clipboard takes everywhere. */
async function asPng(source: string) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  return new Promise<Blob>((done, fail) => canvas.toBlob((blob) => (blob ? done(blob) : fail(new Error("No picture."))), "image/png"));
}

/**
 * A frame's fills, as a list with the top one first: each a colour or a picture, shown or not, with its own row. Tapping a row's chip opens how it is made
 * (a colour, or a picture from disk and how it sits in the frame); tapping just beside a row's chip and hex selects the row, and ⌘C puts its colour on
 * the clipboard as hex text, or its picture as an image, so pasting on another layer adds it there as a new fill.
 */
function FillsSection({ frame, surface, pictures, onChange, onPick }: { frame: CanvasFrame; surface: string; pictures?: (name: string) => string | undefined; onChange: (patch: Partial<CanvasFrame>) => void; onPick?: (file: File, at: number) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const picking = useRef(0);
  const fills = fillsOf(frame, surface);
  // Once changed here the list is the frame's own, and the single colour and picture it began with are no longer read.
  const set = (next: FillLayer[]) => onChange({ fills: next, fill: undefined, fillImage: undefined });
  const replace = (at: number, layer: FillLayer) => set(fills.map((one, i) => (i === at ? layer : one)));
  const copy = async (layer: FillLayer) => {
    // What was copied before from the canvas is no longer what ⌘V should put down.
    window.dispatchEvent(new Event("studio:clipboard-taken"));
    try {
      const source = layer.kind === "image" ? pictures?.(layer.name) : undefined;
      // The picture is handed over as a promise, so Safari still counts it as part of the key press.
      if (layer.kind === "image" && source) {
        const png = asPng(source).then((blob) => {
          copiedFill.name = layer.name;
          copiedFill.size = blob.size;
          return blob;
        });
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      } else if (layer.kind === "solid") {
        copiedFill.name = null;
        await navigator.clipboard.writeText(toHex(asRgb(layer.color)).toUpperCase());
      }
    } catch {
      // Clipboard not allowed here: nothing is copied.
    }
  };
  const control = "grid size-5 place-items-center rounded-[var(--r-xs)] text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:text-foreground";
  return (
    <Section
      title="Fill"
      action={
        <button
          type="button"
          aria-label="Add fill"
          onClick={() => set([{ kind: "solid", color: "#d9d9d9" }, ...fills])}
          className="grid size-6 place-items-center rounded-[var(--r-control)] text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset hover:text-foreground"
        >
          +
        </button>
      }
    >
      {fills.map((layer, at) => {
        const trailing = (
          <span className="flex shrink-0 items-center">
            <button type="button" aria-label={layer.hidden ? "Show fill" : "Hide fill"} onClick={() => replace(at, { ...layer, hidden: !layer.hidden })} className={control}>
              {layer.hidden ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
            </button>
            <button type="button" aria-label="Remove fill" onClick={() => set(fills.filter((_, i) => i !== at))} className={control}>
              −
            </button>
          </span>
        );
        const preview = layer.kind === "image" ? pictures?.(layer.name) : undefined;
        return (
          <div key={at} className="flex flex-col gap-2">
            <div
              tabIndex={0}
              role="group"
              aria-label={`Fill ${at + 1} row`}
              onPointerDown={(event) => {
                if (event.target !== event.currentTarget) return;
                event.preventDefault();
                event.currentTarget.focus();
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "c") return;
                event.preventDefault();
                // The canvas's own ⌘C (layers) stays out of it.
                event.stopPropagation();
                void copy(layer);
              }}
              className={`-mx-2 rounded-[var(--r-md)] px-2 py-1 outline-none focus:bg-[var(--selection-muted)] ${layer.hidden ? "opacity-50" : ""}`}
            >
              {layer.kind === "image" ? (
                <div className="flex h-7 items-center gap-2 rounded-[var(--r-md)] bg-surface-inset pl-1.5 pr-1 text-xs">
                  <button
                    type="button"
                    aria-label="Fill, picture"
                    onClick={() => setOpen((now) => (now === at ? null : at))}
                    style={preview ? { background: `url("${preview}") center / cover` } : undefined}
                    className="size-4 shrink-0 cursor-pointer overflow-hidden rounded-[var(--r-sm)] border border-border"
                  />
                  <span className="flex-1 text-foreground">Image</span>
                  {trailing}
                </div>
              ) : (
                <ColorField label={`Fill ${at + 1}`} value={asRgb(layer.color)} onCommit={(css) => replace(at, { ...layer, color: css })} onChip={() => setOpen((now) => (now === at ? null : at))} trailing={trailing} />
              )}
            </div>
            {open === at ? (
              <div className="flex flex-col gap-2 rounded-[var(--r-md)] border border-border p-2">
                <Choice
                  label="Fill type"
                  value={layer.kind}
                  options={[
                    { value: "solid", title: "Solid", icon: <span className="text-xs">Solid</span> },
                    { value: "image", title: "Image", icon: <span className="text-xs">Image</span> },
                  ]}
                  onChange={(kind) => {
                    if (kind === "solid" && layer.kind !== "solid") replace(at, { kind: "solid", color: "#d9d9d9" });
                    else if (kind === "image" && layer.kind !== "image") {
                      picking.current = at;
                      input.current?.click();
                    }
                  }}
                />
                {layer.kind === "image" ? (
                  <>
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt="" className="h-20 w-full rounded-[var(--r-sm)] border border-border object-cover" />
                    ) : null}
                    <SelectField
                      label="Image fit"
                      caption="Fit"
                      value={layer.mode}
                      options={[
                        { value: "fill", label: "Fill" },
                        { value: "fit", label: "Fit" },
                        { value: "tile", label: "Tile" },
                        { value: "stretch", label: "Stretch" },
                      ]}
                      onChange={(mode) => replace(at, { ...layer, mode: mode as "fill" | "fit" | "tile" | "stretch" })}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        picking.current = at;
                        input.current?.click();
                      }}
                      className="h-7 rounded-[var(--r-control)] border border-border px-3 text-xs text-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset"
                    >
                      Choose image
                    </button>
                  </>
                ) : (
                  <input
                    type="color"
                    aria-label="Fill colour"
                    value={/^#[0-9a-f]{6}$/i.test(toHex(asRgb(layer.color))) ? toHex(asRgb(layer.color)) : "#ffffff"}
                    onChange={(event) => replace(at, { ...layer, color: event.target.value })}
                    className="h-8 w-full cursor-pointer rounded-[var(--r-sm)] border border-border bg-transparent"
                  />
                )}
              </div>
            ) : null}
          </div>
        );
      })}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onPick?.(file, picking.current);
        }}
      />
    </Section>
  );
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

const number = (css: string) => parseFloat(css) || 0;
/** The colour field reads colours as the browser reports them (`rgb(...)`), and a frame's fill is kept as it was typed (`#fff`), so it is put the same way. */
const asRgb = (css: string) => {
  const hex = css.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return css;
  const full = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
  return `rgb(${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)})`;
};

/**
 * A frame drawn on the canvas, as things to change: what it is called, where it is and how big, and how it looks. Changes
 * show at once; the frame is kept with the canvas (see lib/canvas-saved.ts).
 */
/** How a layer in a frame (with no layout) is pinned to it, on each side: as `position: absolute` with insets does in CSS. */
export type PinPanel = { x: "none" | "start" | "end" | "both" | "center"; y: "none" | "start" | "end" | "both" | "center"; onChange: (axis: "x" | "y", value: "none" | "start" | "end" | "both" | "center") => void };

/**
 * How a layer is pinned to the frame it is in, as Figma's constraints are: a menu for each direction, and a box with a tick on each side to press
 * (pinned sides are lit; both lit stretches it) and a plus in the middle to keep it centred.
 */
function ConstraintsField({ pin }: { pin: PinPanel }) {
  const labels = (start: string, end: string) => [
    { value: "none", label: "None" },
    { value: "start", label: start },
    { value: "end", label: end },
    { value: "both", label: `${start} & ${end}` },
    { value: "center", label: "Centre" },
  ];
  // A side pressed is pinned or let go; the other side is kept. Both pinned is the stretching one.
  const press = (axis: "x" | "y", side: "start" | "end") => {
    const now = pin[axis];
    const flags = { start: now === "start" || now === "both", end: now === "end" || now === "both" };
    flags[side] = !flags[side];
    pin.onChange(axis, flags.start && flags.end ? "both" : flags.start ? "start" : flags.end ? "end" : "none");
  };
  const centred = pin.x === "center" && pin.y === "center";
  const lit = (axis: "x" | "y", side: "start" | "end") => pin[axis] === side || pin[axis] === "both";
  const tick = (axis: "x" | "y", side: "start" | "end", name: string, line: string) => (
    <button
      type="button"
      aria-label={`Pin to the ${name}`}
      aria-pressed={lit(axis, side)}
      title={`Pin to the ${name}`}
      onClick={() => press(axis, side)}
      className="group grid place-items-center"
    >
      <span className={`${line} rounded-full transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${lit(axis, side) ? "bg-[var(--selection)]" : "bg-foreground-subtle group-hover:bg-foreground-muted"}`} />
    </button>
  );
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <div className="flex min-w-0 flex-col gap-2">
        <SelectField label="Horizontal constraint" value={pin.x} options={labels("Left", "Right")} onChange={(value) => pin.onChange("x", value as PinPanel["x"])} />
        <SelectField label="Vertical constraint" value={pin.y} options={labels("Top", "Bottom")} onChange={(value) => pin.onChange("y", value as PinPanel["y"])} />
      </div>
      <div className="grid h-16 w-24 grid-cols-[1.25rem_1fr_1.25rem] grid-rows-[0.75rem_1fr_0.75rem] rounded-[var(--r-md)] bg-surface-inset">
        <span />
        {tick("y", "start", "top", "h-2.5 w-px")}
        <span />
        {tick("x", "start", "left", "h-px w-2.5")}
        <button
          type="button"
          aria-label="Keep centred"
          aria-pressed={centred}
          title="Keep centred"
          onClick={() => {
            pin.onChange("x", centred ? "none" : "center");
            pin.onChange("y", centred ? "none" : "center");
          }}
          className={`grid place-items-center rounded-[var(--r-sm)] border transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${centred ? "border-[var(--selection)] text-[var(--selection)]" : "border-border text-foreground-subtle hover:text-foreground-muted"}`}
        >
          <PlusIcon className="size-3.5" />
        </button>
        {tick("x", "end", "right", "h-px w-2.5")}
        <span />
        {tick("y", "end", "bottom", "h-2.5 w-px")}
        <span />
      </div>
    </div>
  );
}

/** How it looks, the same for every layer: how see-through it is, and (where it has corners to round) how round. */
function AppearanceSection({ canRound, radius, opacity, unit, onRadius, onOpacity }: { canRound: boolean; radius?: number; opacity?: number; unit: number; onRadius: (radius: number) => void; onOpacity: (opacity: number) => void }) {
  return (
    <Section title="Appearance">
      <Row>
        <NumberField unit="opacity" glyph={<Glyph><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M2.5 9 9 2.5M2.5 13.5 13.5 2.5M7 13.5l6.5-6.5" /></Glyph>} label="Opacity" caption="Opacity" value={String(opacity ?? 1)} onCommit={(css) => onOpacity(Number(css))} />
        {canRound ? <NumberField glyph={<Glyph><path d="M2.5 6V4.5a2 2 0 0 1 2-2H6M10 2.5h1.5a2 2 0 0 1 2 2V6M13.5 10v1.5a2 2 0 0 1-2 2H10M6 13.5H4.5a2 2 0 0 1-2-2V10" /></Glyph>} label="Corner radius" caption="Corner radius" value={px((radius ?? 0) * unit)} onCommit={(css) => onRadius(Math.max(0, number(css)) / unit)} /> : null}
      </Row>
    </Section>
  );
}

/** A line round the edge, the same for every layer; a plus until it has one. `always` for what is nothing but a line (a line, an arrow). */
function StrokeSection({ stroke, width, always, unit, onChange }: { stroke?: string; width?: number; always?: boolean; unit: number; onChange: (stroke: string | undefined, width: number | undefined) => void }) {
  return (
    <Section
      title="Stroke"
      applied={!!stroke || !!always}
      onAdd={() => onChange("#000000", 1 / unit)}
      action={always ? undefined : <PanelButton label="Remove stroke" onClick={() => onChange(undefined, undefined)}>−</PanelButton>}
    >
      <Row>
        <TokenColourField label="Stroke" caption="Colour" value={asRgb(stroke ?? "#000000")} onCommit={(css) => onChange(css, width ?? 1 / unit)} />
        <NumberField
          glyph={<span className="text-xs">W</span>}
          label="Stroke width"
          caption="Width"
          value={px((stroke ? (width ?? 1 / unit) : 0) * unit)}
          onCommit={(css) => (number(css) > 0 ? onChange(stroke ?? "#000000", number(css) / unit) : onChange(undefined, undefined))}
        />
      </Row>
    </Section>
  );
}

/** What every layer will have under its stroke, not made yet: a row each, to say where they will be. */
function Coming() {
  return (
    <>
      <Section title="Effects" applied={false} onAdd={() => {}} />
      <Section title="Export" applied={false} onAdd={() => {}} />
    </>
  );
}

export function FramePanel({ frame, unit, surface, inLayout, pin, onFillImage, pictures, onAlign, onChange, onAutoLayout }: { frame: CanvasFrame; /** Set when it is in a frame with no layout. */ pin?: PinPanel; /** When it is in a frame: lines it up with that. */ onAlign?: (mode: AlignMode) => void; /** Puts a picture from disk in the fill at that place in the list; `pictures` gives a picture by its name. */ onFillImage?: (file: File, at: number) => void; pictures?: (name: string) => string | undefined; /** It is in a frame with a layout, so it can fill the room that leaves. */ inLayout?: boolean; /** How many pixels a canvas unit is: the canvas draws things at half size, so sizes are shown in the pixels they stand for. */ unit: number; /** The colour a frame has until it is given one. */ surface: string; onChange: (patch: Partial<CanvasFrame>) => void; /** Reads how what is in the frame is arranged and lays it out that way. */ onAutoLayout: (direction?: "row" | "column" | "grid") => void }) {
  return (
    <div className="flex min-h-full flex-col">
      <PanelTitle name={frame.shape ? { rectangle: "Rectangle", ellipse: "Ellipse", line: "Line", arrow: "Arrow", polygon: "Polygon", star: "Star", path: "Path", sticky: "Sticky note" }[frame.shape] : "Frame"} />
      <Section title="Position">
        {onAlign ? (
          <Field caption="Alignment">
            <AlignFields onAlign={onAlign} />
          </Field>
        ) : null}
        <Field caption="Position">
          <Row>
            <NumberField glyph={<span className="text-xs">X</span>} label="X" value={px(frame.x * unit)} onCommit={(css) => onChange({ x: number(css) / unit })} />
            <NumberField glyph={<span className="text-xs">Y</span>} label="Y" value={px(frame.y * unit)} onCommit={(css) => onChange({ y: number(css) / unit })} />
          </Row>
        </Field>
        {pin ? (
          <Field caption="Constraints">
            <ConstraintsField pin={pin} />
          </Field>
        ) : null}
      </Section>
      <Section title={frame.layout ? "Auto layout" : "Layout"}>
        {!frame.shape ? (
          <Choice
            label="Flow"
            caption="Flow"
            value={flowOf(frame)}
            options={FLOW_OPTIONS}
            onChange={(flow) => {
              if (flow === "freeform") onChange({ layout: undefined });
              else if (frame.layout) onChange({ layout: { ...frame.layout, direction: flow as "row" | "column" | "grid" } });
              else onAutoLayout(flow as "row" | "column" | "grid");
            }}
          />
        ) : null}
        <Field caption="Resizing">
          <Row>
            <SizeField
              glyph={<span className="text-xs">W</span>}
              label="Width"
              mode={frame.shape ? "fixed" : (frame.sizing?.width ?? (frame.layout ? "hug" : "fixed"))}
              modes={frame.shape ? ["fixed"] : inLayout ? ["fixed", "hug", "fill"] : ["fixed", "hug"]}
              value={px(frame.width * unit)}
              onCommit={(css) => onChange({ width: Math.max(8, number(css)) / unit, sizing: { ...frame.sizing, width: "fixed" } })}
              onMode={(mode) => onChange({ sizing: { ...frame.sizing, width: mode as Mode } })}
            />
            <SizeField
              glyph={<span className="text-xs">H</span>}
              label="Height"
              mode={frame.shape ? "fixed" : (frame.sizing?.height ?? (frame.layout ? "hug" : "fixed"))}
              modes={frame.shape ? ["fixed"] : inLayout ? ["fixed", "hug", "fill"] : ["fixed", "hug"]}
              value={px(frame.height * unit)}
              onCommit={(css) => onChange({ height: Math.max(8, number(css)) / unit, sizing: { ...frame.sizing, height: "fixed" } })}
              onMode={(mode) => onChange({ sizing: { ...frame.sizing, height: mode as Mode } })}
            />
          </Row>
        </Field>
        {frame.layout ? (
          <>
            {frame.layout.direction === "grid" ? (
              <>
                <Row>
                  <NumberField
                    glyph={<Glyph><rect x="2" y="2" width="5" height="12" rx="1" /><rect x="9" y="2" width="5" height="12" rx="1" /></Glyph>}
                    label="Columns"
                    caption="Columns"
                    unit="number"
                    value={String(frame.layout.columns ?? 2)}
                    onCommit={(css) => onChange({ layout: { ...frame.layout!, columns: Math.max(1, Math.min(12, Math.round(number(css)))) } })}
                  />
                </Row>
                <Row>
                  <SelectField
                    label="Column gap"
                    caption="Column gap"
                    value={`${frame.layout.gap}`}
                    options={SPACING.map((step) => ({ value: `${step}`, label: `${step}px` }))}
                    onChange={(gap) => onChange({ layout: { ...frame.layout!, gap: Number(gap) } })}
                  />
                  <SelectField
                    label="Row gap"
                    caption="Row gap"
                    value={`${frame.layout.rowGap ?? frame.layout.gap}`}
                    options={SPACING.map((step) => ({ value: `${step}`, label: `${step}px` }))}
                    onChange={(gap) => onChange({ layout: { ...frame.layout!, rowGap: Number(gap) } })}
                  />
                </Row>
              </>
            ) : (
            <Row>
              <SelectField
                label="Gap"
                caption="Gap"
                value={`${frame.layout.gap}`}
                options={SPACING.map((step) => ({ value: `${step}`, label: `${step}px` }))}
                onChange={(gap) => onChange({ layout: { ...frame.layout!, gap: Number(gap) } })}
              />
              <SelectField
                label="Distribution"
                caption="Distribute"
                value={frame.layout.justify ?? "start"}
                options={[
                  { value: "start", label: "Packed" },
                  { value: "between", label: "Space between" },
                ]}
                onChange={(justify) => onChange({ layout: { ...frame.layout!, justify: justify as "start" | "between" } })}
              />
            </Row>
            )}
            <Choice
              label="Alignment"
              caption="Alignment"
              value={frame.layout.align}
              options={
                frame.layout.direction === "grid"
                  ? [
                      { value: "start", title: "Start of each cell", icon: <span className="text-xs">Start</span> },
                      { value: "center", title: "Middle of each cell", icon: <span className="text-xs">Centre</span> },
                      { value: "end", title: "End of each cell", icon: <span className="text-xs">End</span> },
                    ]
                  : frame.layout.direction === "column"
                  ? [
                      { value: "start", title: "Align left", icon: <AlignLeftIcon /> },
                      { value: "center", title: "Align centre", icon: <AlignCenterXIcon /> },
                      { value: "end", title: "Align right", icon: <AlignRightIcon /> },
                    ]
                  : [
                      { value: "start", title: "Align top", icon: <AlignTopIcon /> },
                      { value: "center", title: "Align middle", icon: <AlignMiddleIcon /> },
                      { value: "end", title: "Align bottom", icon: <AlignBottomIcon /> },
                    ]
              }
              onChange={(align) => onChange({ layout: { ...frame.layout!, align: align as "start" | "center" | "end" } })}
            />
            <Field caption="Padding">
              <Row>
                <NumberField
                  glyph={<Glyph><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M6 5.5v5M10 5.5v5" /></Glyph>}
                  label="Horizontal padding"
                  value={px((frame.layout.paddingX ?? frame.layout.padding) * 1)}
                  onCommit={(css) => onChange({ layout: { ...frame.layout!, paddingX: Math.max(0, number(css)) } })}
                />
                <NumberField
                  glyph={<Glyph><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M5.5 6h5M5.5 10h5" /></Glyph>}
                  label="Vertical padding"
                  value={px((frame.layout.paddingY ?? frame.layout.padding) * 1)}
                  onCommit={(css) => onChange({ layout: { ...frame.layout!, paddingY: Math.max(0, number(css)) } })}
                />
              </Row>
            </Field>
          </>
        ) : null}
        {!frame.shape ? <Check label="Clip content" checked={!!frame.clip} onChange={(clip) => onChange({ clip })} /> : null}
      </Section>
      <AppearanceSection
        canRound={!frame.shape || frame.shape === "rectangle"}
        radius={frame.radius}
        opacity={frame.opacity}
        unit={unit}
        onRadius={(radius) => onChange({ radius })}
        onOpacity={(opacity) => onChange({ opacity })}
      />
      {frame.shape !== "line" && frame.shape !== "arrow" ? <FillsSection frame={frame} surface={surface} pictures={pictures} onChange={onChange} onPick={onFillImage} /> : null}
      {/* A line or an arrow is its stroke, so it always has one; anything else has a stroke when it is added. */}
      <StrokeSection stroke={frame.stroke} width={frame.strokeWidth} always={frame.shape === "line" || frame.shape === "arrow"} unit={unit} onChange={(stroke, strokeWidth) => onChange({ stroke, strokeWidth })} />
      <Coming />
    </div>
  );
}

/**
 * A text, an image or a component put on the canvas, as where it is: from the corner of the frame it is in, or of the canvas when it
 * is in none. Moving it here moves it as dragging would.
 */
export type TextStyle = { size: number; weight: number; color: string; align: "left" | "center" | "right"; /** The face (`diatype`; absent is the system's), and how tall a line is and how far apart the letters are, as percentages. */ family?: string; lineHeight?: number; letterSpacing?: number };

export function PiecePanel({
  label,
  x,
  y,
  width,
  height,
  resize,
  inFrame,
  unit,
  onMove,
  onSize,
  sizing,
  onSizing,
  onAlign,
  pin,
  text,
  onText,
  component,
  fork,
  instance,
  geometryOnly,
  look,
  onLook,
  image,
}: {
  /** Set when it is in a frame with no layout: how it is pinned to it. */
  pin?: PinPanel;
  label: string;
  x: number;
  y: number;
  /** Its size in pixels; changed here only where it can be (`resize`: an image both ways, a text its width). */
  width: number;
  height: number;
  resize?: "both" | "width";
  /** The frame it is in, by name: its position is counted from the frame's corner. */
  inFrame?: string;
  unit: number;
  onMove: (x: number, y: number) => void;
  /** `only` is the side that was typed, the one that becomes fixed. */
  onSize?: (width: number, height: number, only?: "width" | "height") => void;
  /** How each side is sized, and which ways it can be (fill only in an auto layout frame; a component only hugs). */
  sizing: { width: Mode; height: Mode; widthModes: Mode[]; heightModes: Mode[] };
  onSizing: (side: "width" | "height", mode: Mode) => void;
  /** When it is in a frame: lines it up with that. */
  onAlign?: (mode: AlignMode) => void;
  /** For a text: how it is set, and the way to change it. */
  text?: TextStyle;
  onText?: (patch: Partial<TextStyle>) => void;
  /** For a fork: the component it is a copy of. `instance` for a copy of the fork, which is held to what a component's instance is. */
  fork?: string;
  instance?: boolean;
  /** Only where it is and how big: the rest of what is shown is the properties of an element (a fork's top element), shown beside this. */
  geometryOnly?: boolean;
  /** For a component: the other ways it can be shown (variants), the one it is, and the way to put it back as it was dragged out. */
  component?: { /** Makes the project's own copy of it, to change freely; absent where that can't be done. `forking` while it is being made. */ onFork?: () => void; forking?: boolean; /** Its props that are plain values, as it is drawn now; `changed` for the ones set here. */ props: { key: string; value: string | number | boolean; changed: boolean }[]; onProp: (key: string, value: string | number | boolean) => void; variants: { id: string; label: string }[]; current: string; changed: boolean; onVariant: (id: string) => void; onReset: () => void };
  /** How it looks, as a frame's does, and the way to change it. */
  look?: { radius?: number; opacity?: number; fill?: string; stroke?: string; strokeWidth?: number };
  onLook?: (patch: { radius?: number; opacity?: number; fill?: string | undefined; stroke?: string | undefined; strokeWidth?: number | undefined }) => void;
  /** For an image: how it sits in its box, and swapping the picture for another from disk. */
  image?: { fit: "fill" | "fit" | "stretch"; onFit: (fit: "fill" | "fit" | "stretch") => void; onReplace: (file: File) => void };
}) {
  const replace = useRef<HTMLInputElement>(null);
  return (
    <div className="flex min-h-full flex-col">
      <PanelTitle
        name={label}
        component={!!component}
        fork={!!fork}
        note={fork ? (instance ? "Instance" : `Based on ${fork}`) : undefined}
        action={
          component?.onFork ? (
            <IconButton size="sm" label={`Fork ${label}`} tooltip={false} loading={component.forking} disabled={component.forking} onClick={component.onFork}>
              Fork
            </IconButton>
          ) : undefined
        }
      >
        {component && (component.variants.length || component.changed || component.props.length) ? (
          <>
          {component.variants.length ? (
            <SelectField label="Variant" caption="Variant" value={component.current} options={component.variants.map((one) => ({ value: one.id, label: one.label }))} onChange={component.onVariant} />
          ) : null}
          {component.props.map((prop) =>
            typeof prop.value === "boolean" ? (
              <Check key={prop.key} label={prop.key} checked={prop.value} onChange={(value) => component.onProp(prop.key, value)} />
            ) : (
              <Field key={prop.key} caption={prop.key}>
                <input
                  type={typeof prop.value === "number" ? "number" : "text"}
                  aria-label={prop.key}
                  defaultValue={prop.value}
                  key={`${prop.key}-${prop.value}`}
                  onFocus={(event) => event.target.select()}
                  onBlur={(event) => {
                    const next = typeof prop.value === "number" ? Number(event.target.value) : event.target.value;
                    if (next !== prop.value && !(typeof next === "number" && Number.isNaN(next))) component.onProp(prop.key, next);
                  }}
                  onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                  className={`h-7 w-full rounded-[var(--r-control)] bg-surface-inset px-2 text-xs outline-none focus:ring-1 focus:ring-[var(--focus-ring)] ${prop.changed ? "text-foreground" : "text-foreground-muted"}`}
                />
              </Field>
            ),
          )}
          {component.changed ? (
            <button
              type="button"
              onClick={component.onReset}
              className="h-7 rounded-[var(--r-control)] border border-border px-3 text-xs text-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset"
            >
              Reset to original
            </button>
          ) : null}
          </>
        ) : null}
      </PanelTitle>
      <Section title="Position">
        {onAlign ? (
          <Field caption="Alignment">
            <AlignFields onAlign={onAlign} />
          </Field>
        ) : null}
        <Field caption="Position">
          <Row>
            <NumberField glyph={<span className="text-xs">X</span>} label="X" value={px(x * unit)} onCommit={(css) => onMove(number(css) / unit, y)} />
            <NumberField glyph={<span className="text-xs">Y</span>} label="Y" value={px(y * unit)} onCommit={(css) => onMove(x, number(css) / unit)} />
          </Row>
        </Field>
        {pin ? (
          <Field caption="Constraints">
            <ConstraintsField pin={pin} />
          </Field>
        ) : null}
      </Section>
      <Section title="Layout">
        <Field caption="Resizing">
          <Row>
            <SizeField
              glyph={<span className="text-xs">W</span>}
              label="Width"
              mode={sizing.width as Mode}
              modes={sizing.widthModes as Mode[]}
              value={px(width)}
              onCommit={(css) => resize && onSize?.(Math.max(8, number(css)), height, "width")}
              onMode={(mode) => onSizing("width", mode)}
            />
            {resize === "both" ? (
              <SizeField
                glyph={<span className="text-xs">H</span>}
                label="Height"
                mode={sizing.height as Mode}
                modes={sizing.heightModes as Mode[]}
                value={px(height)}
                onCommit={(css) => onSize?.(width, Math.max(8, number(css)), "height")}
                onMode={(mode) => onSizing("height", mode)}
              />
            ) : null}
          </Row>
        </Field>
      </Section>
      {geometryOnly ? null : (
        <>
      <AppearanceSection canRound radius={look?.radius} opacity={look?.opacity} unit={unit} onRadius={(radius) => onLook?.({ radius })} onOpacity={(opacity) => onLook?.({ opacity })} />
      {image ? (
        <Section title="Image">
          <SelectField
            label="Image fit"
            caption="Fit"
            value={image.fit}
            options={[
              { value: "fill", label: "Fill" },
              { value: "fit", label: "Fit" },
              { value: "stretch", label: "Stretch" },
            ]}
            onChange={(fit) => image.onFit(fit as "fill" | "fit" | "stretch")}
          />
          <button
            type="button"
            onClick={() => replace.current?.click()}
            className="h-7 rounded-[var(--r-control)] border border-border px-3 text-xs text-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset"
          >
            Replace image
          </button>
          <input
            ref={replace}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) image.onReplace(file);
            }}
          />
        </Section>
      ) : null}
      {text && onText ? (
        <Section title="Typography">
          <SelectField
            label="Font"
            value={text.family === "diatype" ? "diatype" : "system"}
            options={[
              { value: "diatype", label: "ABC Diatype" },
              { value: "system", label: "System" },
            ]}
            onChange={(family) => onText({ family })}
          />
          <Row>
            <SelectField
              label="Weight"
              value={`${[400, 500, 700].reduce((best, one) => (Math.abs(one - text.weight) < Math.abs(best - text.weight) ? one : best), 400)}`}
              options={[
                { value: "400", label: "Regular" },
                { value: "500", label: "Medium" },
                { value: "700", label: "Bold" },
              ]}
              onChange={(weight) => onText({ weight: Number(weight) })}
            />
            <NumberField
              glyph={<span className="text-xs">Aa</span>}
              label="Size"
              value={px(text.size)}
              onCommit={(css) => onText({ size: Math.max(1, number(css)) })}
              trailing={<PresetMenu label="Size presets" options={[8, 10, 12, 14, 16, 18, 20, 24, 32, 40, 48, 64, 96]} onPick={(size) => onText({ size })} />}
            />
          </Row>
          <Row>
            <NumberField
              unit="number"
              caption="Line height"
              glyph={<Glyph><path d="M4.5 10.5 8 3l3.5 7.5M5.7 8h4.6M3 13.5h10" /></Glyph>}
              label="Line height"
              value={String(text.lineHeight ?? 130)}
              onCommit={(css) => onText({ lineHeight: Math.max(50, Number(css) || 130) })}
              trailing={<span className="pr-1 text-foreground-subtle">%</span>}
            />
            <NumberField
              unit="number"
              caption="Letter spacing"
              glyph={<Glyph><path d="M2.5 3v10M13.5 3v10M5.5 11 8 5l2.5 6M6.3 9.5h3.4" /></Glyph>}
              label="Letter spacing"
              value={String(text.letterSpacing ?? 0)}
              onCommit={(css) => onText({ letterSpacing: Number(css) || 0 })}
              trailing={<span className="pr-1 text-foreground-subtle">%</span>}
            />
          </Row>
          <Choice
            label="Alignment"
            caption="Alignment"
            value={text.align}
            options={[
              { value: "left", title: "Left", icon: <Glyph><path d="M2.5 4h11M2.5 8h7M2.5 12h9" /></Glyph> },
              { value: "center", title: "Centre", icon: <Glyph><path d="M2.5 4h11M4.5 8h7M3.5 12h9" /></Glyph> },
              { value: "right", title: "Right", icon: <Glyph><path d="M2.5 4h11M6.5 8h7M4.5 12h9" /></Glyph> },
            ]}
            onChange={(align) => onText({ align: align as TextStyle["align"] })}
          />
        </Section>
      ) : null}
      {text ? (
        // A text is drawn in its fill: the colour of the letters, which it always has.
        <Section title="Fill">
          <TokenColourField label="Fill" value={asRgb(text.color)} onCommit={(css) => onText?.({ color: css })} />
        </Section>
      ) : (
        <Section title="Fill" applied={!!look?.fill} onAdd={() => onLook?.({ fill: "#ffffff" })} action={<PanelButton label="Remove fill" onClick={() => onLook?.({ fill: undefined })}>−</PanelButton>}>
          <TokenColourField label="Fill" value={asRgb(look?.fill ?? "#ffffff")} onCommit={(css) => onLook?.({ fill: css })} />
        </Section>
      )}
      <StrokeSection stroke={look?.stroke} width={look?.strokeWidth} unit={unit} onChange={(stroke, strokeWidth) => onLook?.({ stroke, strokeWidth })} />
      <Coming />
        </>
      )}
    </div>
  );
}
