"use client";

import { Check, ColorField, Field, NumberField, Row, Section } from "@/components/prototype/edit-fields";
import type { CanvasFrame } from "@/lib/canvas-saved";

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

const number = (css: string) => parseFloat(css) || 0;

/**
 * A frame drawn on the canvas, as things to change: what it is called, where it is and how big, and how it looks. Changes
 * show at once; the frame is kept with the canvas (see lib/canvas-saved.ts).
 */
export function FramePanel({ frame, unit, surface, onChange, onDelete }: { frame: CanvasFrame; /** How many pixels a canvas unit is: the canvas draws things at half size, so sizes are shown in the pixels they stand for. */ unit: number; /** The colour a frame has until it is given one. */ surface: string; onChange: (patch: Partial<CanvasFrame>) => void; onDelete: () => void }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-divider p-4">
        <Field caption="Frame">
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
          <NumberField glyph={<span className="text-xs">W</span>} label="Width" value={px(frame.width * unit)} onCommit={(css) => onChange({ width: Math.max(8, number(css)) / unit })} />
          <NumberField glyph={<span className="text-xs">H</span>} label="Height" value={px(frame.height * unit)} onCommit={(css) => onChange({ height: Math.max(8, number(css)) / unit })} />
        </Row>
      </Section>
      <Section title="Appearance">
        <ColorField label="Fill" caption="Fill" value={frame.fill ?? surface} onCommit={(css) => onChange({ fill: css })} />
        <Row>
          <NumberField glyph={<span className="text-xs">R</span>} label="Corner radius" caption="Radius" value={px((frame.radius ?? 0) * unit)} onCommit={(css) => onChange({ radius: Math.max(0, number(css)) / unit })} />
        </Row>
        <Check label="Clip content" checked={!!frame.clip} onChange={(clip) => onChange({ clip })} />
      </Section>
      <div className="p-4">
        <button
          type="button"
          onClick={onDelete}
          className="h-8 rounded-[var(--r-control)] border border-border px-3 text-xs text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset hover:text-foreground"
        >
          Delete frame
        </button>
      </div>
    </div>
  );
}
