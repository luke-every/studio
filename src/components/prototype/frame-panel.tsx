"use client";

import { useRef, useState } from "react";

import { AlignBottomIcon, EyeIcon, EyeOffIcon, AlignCenterXIcon, AlignLeftIcon, AlignMiddleIcon, AlignRightIcon, AlignTopIcon, DistributeXIcon, DistributeYIcon } from "@/components/shell/nav-icons";
import { Check, Choice, ColorField, Field, NumberField, Row, SelectField, Section } from "@/components/prototype/edit-fields";
import { SPACING } from "@/lib/canvas-layout";
import { copiedFill } from "@/lib/canvas-clipboard";
import { toHex } from "@/lib/edit-dom";
import { fillsOf, type CanvasFrame, type FillLayer } from "@/lib/canvas-saved";

type Mode = "fixed" | "hug" | "fill";
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

/** Several layers selected together. */
export function BunchPanel({ count, onAlign }: { count: number; onAlign: (mode: AlignMode) => void }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-divider p-4">
        <Field caption={`${count} layers`}>
          <span className="sr-only">{count} layers selected</span>
        </Field>
      </div>
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

function PinSection({ pin }: { pin: PinPanel }) {
  const options = (start: string, end: string) => [
    { value: "none", title: "Stays where it is", icon: <span className="text-xs">None</span> },
    { value: "start", title: `Keeps its distance from the ${start.toLowerCase()}`, icon: <span className="text-xs">{start}</span> },
    { value: "end", title: `Keeps its distance from the ${end.toLowerCase()}`, icon: <span className="text-xs">{end}</span> },
    { value: "both", title: `Keeps both distances: it stretches`, icon: <span className="text-xs">Both</span> },
    { value: "center", title: "Stays in the middle", icon: <span className="text-xs">Mid</span> },
  ];
  return (
    <Section title="Pin">
      <Choice label="Pin across" caption="Across" value={pin.x} options={options("Left", "Right")} onChange={(value) => pin.onChange("x", value as PinPanel["x"])} />
      <Choice label="Pin down" caption="Down" value={pin.y} options={options("Top", "Bottom")} onChange={(value) => pin.onChange("y", value as PinPanel["y"])} />
    </Section>
  );
}

export function FramePanel({ frame, unit, surface, inLayout, pin, onFillImage, pictures, onAlign, onChange, onAutoLayout }: { frame: CanvasFrame; /** Set when it is in a frame with no layout. */ pin?: PinPanel; /** When it is in a frame: lines it up with that. */ onAlign?: (mode: AlignMode) => void; /** Puts a picture from disk in the fill at that place in the list; `pictures` gives a picture by its name. */ onFillImage?: (file: File, at: number) => void; pictures?: (name: string) => string | undefined; /** It is in a frame with a layout, so it can fill the room that leaves. */ inLayout?: boolean; /** How many pixels a canvas unit is: the canvas draws things at half size, so sizes are shown in the pixels they stand for. */ unit: number; /** The colour a frame has until it is given one. */ surface: string; onChange: (patch: Partial<CanvasFrame>) => void; /** Reads how what is in the frame is arranged and lays it out that way. */ onAutoLayout: () => void }) {
  return (
    <div className="flex min-h-full flex-col">
      {onAlign ? <AlignRow onAlign={onAlign} spread={false} /> : null}
      <div className="flex flex-col gap-1 border-b border-divider p-4">
        <Field caption={frame.shape ? { rectangle: "Rectangle", ellipse: "Ellipse", line: "Line", arrow: "Arrow", polygon: "Polygon", star: "Star", path: "Path" }[frame.shape] : "Frame"}>
          <input
            type="text"
            aria-label="Frame name"
            value={frame.name}
            onFocus={(event) => event.target.select()}
            onChange={(event) => onChange({ name: event.target.value })}
            className="h-7 w-full rounded-[var(--r-control)] bg-surface-inset px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
          />
        </Field>
      </div>
      <Section title="Layout">
        <Row>
          <NumberField glyph={<span className="text-xs">X</span>} label="X" value={px(frame.x * unit)} onCommit={(css) => onChange({ x: number(css) / unit })} />
          <NumberField glyph={<span className="text-xs">Y</span>} label="Y" value={px(frame.y * unit)} onCommit={(css) => onChange({ y: number(css) / unit })} />
        </Row>
        <Row>
          <NumberField glyph={<span className="text-xs">W</span>} label="Width" value={px(frame.width * unit)} onCommit={(css) => onChange({ width: Math.max(8, number(css)) / unit, sizing: { ...frame.sizing, width: "fixed" } })} />
          <NumberField glyph={<span className="text-xs">H</span>} label="Height" value={px(frame.height * unit)} onCommit={(css) => onChange({ height: Math.max(8, number(css)) / unit, sizing: { ...frame.sizing, height: "fixed" } })} />
        </Row>
        {pin ? <PinSection pin={pin} /> : null}
      {!frame.shape ? (
        <Row>
          <SelectField
            label="Width sizing"
            caption="Width"
            value={frame.sizing?.width ?? (frame.layout ? "hug" : "fixed")}
            options={sizingOptions(inLayout ? ["fixed", "hug", "fill"] : ["fixed", "hug"])}
            onChange={(mode) => onChange({ sizing: { ...frame.sizing, width: mode as Mode } })}
          />
          <SelectField
            label="Height sizing"
            caption="Height"
            value={frame.sizing?.height ?? (frame.layout ? "hug" : "fixed")}
            options={sizingOptions(inLayout ? ["fixed", "hug", "fill"] : ["fixed", "hug"])}
            onChange={(mode) => onChange({ sizing: { ...frame.sizing, height: mode as Mode } })}
          />
        </Row>
        ) : null}
      </Section>
      {!frame.shape ? (
      <Section
        title="Auto layout"
        action={
          <button
            type="button"
            aria-label={frame.layout ? "Remove auto layout" : "Add auto layout"}
            onClick={() => (frame.layout ? onChange({ layout: undefined }) : onAutoLayout())}
            className="grid size-6 place-items-center rounded-[var(--r-control)] text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset hover:text-foreground"
          >
            {frame.layout ? "−" : "+"}
          </button>
        }
      >
        {frame.layout ? (
          <>
            <Choice
              label="Direction"
              caption="Direction"
              value={frame.layout.direction}
              options={[
                { value: "row", title: "Side by side", icon: <span className="text-xs">→</span> },
                { value: "column", title: "Stacked", icon: <span className="text-xs">↓</span> },
              ]}
              onChange={(direction) => onChange({ layout: { ...frame.layout!, direction: direction as "row" | "column" } })}
            />
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
            <Row>
              <SelectField
                label="Horizontal padding"
                caption="Padding ↔"
                value={`${frame.layout.paddingX ?? frame.layout.padding}`}
                options={SPACING.map((step) => ({ value: `${step}`, label: `${step}px` }))}
                onChange={(value) => onChange({ layout: { ...frame.layout!, paddingX: Number(value) } })}
              />
              <SelectField
                label="Vertical padding"
                caption="Padding ↕"
                value={`${frame.layout.paddingY ?? frame.layout.padding}`}
                options={SPACING.map((step) => ({ value: `${step}`, label: `${step}px` }))}
                onChange={(value) => onChange({ layout: { ...frame.layout!, paddingY: Number(value) } })}
              />
            </Row>
            <Choice
              label="Alignment"
              caption="Align"
              value={frame.layout.align}
              options={[
                { value: "start", title: "Start", icon: <span className="text-xs">Start</span> },
                { value: "center", title: "Centre", icon: <span className="text-xs">Centre</span> },
                { value: "end", title: "End", icon: <span className="text-xs">End</span> },
              ]}
              onChange={(align) => onChange({ layout: { ...frame.layout!, align: align as "start" | "center" | "end" } })}
            />
          </>
        ) : null}
      </Section>
      ) : null}
      {frame.shape !== "line" && frame.shape !== "arrow" ? <FillsSection frame={frame} surface={surface} pictures={pictures} onChange={onChange} onPick={onFillImage} /> : null}
      <Section title="Appearance">
        {!frame.shape || frame.shape === "rectangle" ? (
        <Row>
          <NumberField glyph={<span className="text-xs">R</span>} label="Corner radius" caption="Radius" value={px((frame.radius ?? 0) * unit)} onCommit={(css) => onChange({ radius: Math.max(0, number(css)) / unit })} />
        </Row>
        ) : null}
        <Row>
          <ColorField label="Stroke" caption="Stroke" value={asRgb(frame.stroke ?? "#000000")} onCommit={(css) => onChange({ stroke: css, strokeWidth: frame.strokeWidth ?? 1 / unit })} />
          <NumberField
            glyph={<span className="text-xs">W</span>}
            label="Stroke width"
            caption="Stroke width"
            value={px((frame.stroke ? (frame.strokeWidth ?? 1 / unit) : 0) * unit)}
            onCommit={(css) => (number(css) > 0 ? onChange({ stroke: frame.stroke ?? "#000000", strokeWidth: number(css) / unit }) : onChange({ stroke: undefined, strokeWidth: undefined }))}
          />
        </Row>
        {!frame.shape ? <Check label="Clip content" checked={!!frame.clip} onChange={(clip) => onChange({ clip })} /> : null}
      </Section>
    </div>
  );
}

/**
 * A text, an image or a component put on the canvas, as where it is: from the corner of the frame it is in, or of the canvas when it
 * is in none. Moving it here moves it as dragging would.
 */
export type TextStyle = { size: number; weight: number; color: string; align: "left" | "center" | "right" };

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
  onSize?: (width: number, height: number) => void;
  /** How each side is sized, and which ways it can be (fill only in an auto layout frame; a component only hugs). */
  sizing: { width: Mode; height: Mode; widthModes: Mode[]; heightModes: Mode[] };
  onSizing: (side: "width" | "height", mode: Mode) => void;
  /** When it is in a frame: lines it up with that. */
  onAlign?: (mode: AlignMode) => void;
  /** For a text: how it is set, and the way to change it. */
  text?: TextStyle;
  onText?: (patch: Partial<TextStyle>) => void;
  /** For a component: the other ways it can be shown (variants), the one it is, and the way to put it back as it was dragged out. */
  component?: { /** Its props that are plain values, as it is drawn now; `changed` for the ones set here. */ props: { key: string; value: string | number | boolean; changed: boolean }[]; onProp: (key: string, value: string | number | boolean) => void; variants: { id: string; label: string }[]; current: string; changed: boolean; onVariant: (id: string) => void; onReset: () => void };
  /** For an image: how it sits in its box, and swapping the picture for another from disk. */
  image?: { fit: "fill" | "fit" | "stretch"; onFit: (fit: "fill" | "fit" | "stretch") => void; onReplace: (file: File) => void };
}) {
  const replace = useRef<HTMLInputElement>(null);
  return (
    <div className="flex min-h-full flex-col">
      {onAlign ? <AlignRow onAlign={onAlign} spread={false} /> : null}
      <div className="flex flex-col gap-1 border-b border-divider p-4">
        <Field caption={inFrame ? `${label} in ${inFrame}` : label}>
          <span className="sr-only">{label}</span>
        </Field>
      </div>
      <Section title="Layout">
        <Row>
          <NumberField glyph={<span className="text-xs">X</span>} label="X" value={px(x * unit)} onCommit={(css) => onMove(number(css) / unit, y)} />
          <NumberField glyph={<span className="text-xs">Y</span>} label="Y" value={px(y * unit)} onCommit={(css) => onMove(x, number(css) / unit)} />
        </Row>
        <Row>
          <NumberField glyph={<span className="text-xs">W</span>} label="Width" value={px(width)} onCommit={(css) => resize && onSize?.(Math.max(8, number(css)), height)} />
          {resize === "both" ? <NumberField glyph={<span className="text-xs">H</span>} label="Height" value={px(height)} onCommit={(css) => onSize?.(width, Math.max(8, number(css)))} /> : null}
        </Row>
        <Row>
          <SelectField label="Width sizing" caption="Width" value={sizing.width} options={sizingOptions(sizing.widthModes)} onChange={(mode) => onSizing("width", mode as Mode)} />
          <SelectField label="Height sizing" caption="Height" value={sizing.height} options={sizingOptions(sizing.heightModes)} onChange={(mode) => onSizing("height", mode as Mode)} />
        </Row>
      </Section>
      {pin ? <PinSection pin={pin} /> : null}
      {component && (component.variants.length || component.changed || component.props.length) ? (
        <Section title="Component">
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
        </Section>
      ) : null}
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
        <Section title="Text">
          <Row>
            <NumberField glyph={<span className="text-xs">Aa</span>} label="Size" caption="Size" value={px(text.size)} onCommit={(css) => onText({ size: Math.max(6, number(css)) })} />
            <SelectField
              label="Weight"
              caption="Weight"
              value={`${text.weight}`}
              options={[
                { value: "400", label: "Regular" },
                { value: "500", label: "Medium" },
                { value: "600", label: "Semibold" },
                { value: "700", label: "Bold" },
              ]}
              onChange={(weight) => onText({ weight: Number(weight) })}
            />
          </Row>
          <ColorField label="Colour" caption="Colour" value={asRgb(text.color)} onCommit={(css) => onText({ color: css })} />
          <Choice
            label="Alignment"
            caption="Align"
            value={text.align}
            options={[
              { value: "left", title: "Left", icon: <span className="text-xs">Left</span> },
              { value: "center", title: "Centre", icon: <span className="text-xs">Centre</span> },
              { value: "right", title: "Right", icon: <span className="text-xs">Right</span> },
            ]}
            onChange={(align) => onText({ align: align as TextStyle["align"] })}
          />
        </Section>
      ) : null}
    </div>
  );
}
