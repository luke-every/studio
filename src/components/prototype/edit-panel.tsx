"use client";

import { useReducer, type ReactNode } from "react";

import type { EditSession } from "@/components/prototype/use-edit-session";
import { Choice, ColorField, Glyph, NumberField, Row, Section } from "@/components/prototype/edit-fields";
import { isPicture, textOf } from "@/lib/edit-dom";

/**
 * Edit mode's side panel: the part of the prototype that was clicked, as
 * things to change, and the save for everything changed so far.
 *
 * Changes show on the real prototype as they are made. Saving is in the top
 * bar (see `EditBar`).
 */
export function EditPanel({ element, session }: { element: Element | null; session: EditSession }) {
  // Values are read from the page, so they are read again after each change.
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const view = element?.ownerDocument.defaultView ?? null;
  const css = element && view ? view.getComputedStyle(element) : null;
  const read = (property: string) => css?.getPropertyValue(property).trim() ?? "";
  const text = element ? textOf(element) : null;
  const picture = element ? isPicture(element) : false;
  const flex = css ? css.display.includes("flex") || css.display.includes("grid") : false;
  const column = read("flex-direction").startsWith("column");
  const hasText = element ? [...element.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) : false;

  /** Set one or more properties on the picked element. */
  const set = (...pairs: [string, string][]) => {
    if (!element) return;
    for (const [property, value] of pairs) session.setStyle(element, property, value);
    bump();
  };
  /**
   * One value that stands for several properties (both sides, all corners)
   * while they agree, and one field each when they don't, so every one of them
   * can be seen and changed.
   */
  const linked = (glyph: ReactNode, label: string, parts: { property: string; tag: string; name: string }[]) => {
    const values = parts.map((part) => (read(part.property) === "normal" ? "0px" : read(part.property)));
    if (values.every((value) => value === values[0])) {
      return (
        <NumberField
          glyph={glyph}
          label={label}
          value={values[0]}
          onCommit={(value) => set(...parts.map((part): [string, string] => [part.property, value]))}
        />
      );
    }
    return parts.map((part, i) => (
      <NumberField
        key={part.property}
        glyph={<span className="text-xs">{part.tag}</span>}
        label={`${label.split(",")[0]}, ${part.name}`}
        value={values[i]}
        onCommit={(value) => set([part.property, value])}
      />
    ));
  };

  const border = (change: { width?: string; style?: string; color?: string }) => {
    const width = change.width ?? read("border-top-width");
    const style = change.style ?? (read("border-top-style") === "none" ? "solid" : read("border-top-style"));
    const color = change.color ?? read("border-top-color");
    set(["border", `${width} ${style} ${color}`]);
  };

  const alignment = [
    { value: "left", title: "Left", icon: <Glyph><path d="M2.5 4h11M2.5 8h7M2.5 12h9" /></Glyph> },
    { value: "center", title: "Centre", icon: <Glyph><path d="M2.5 4h11M4.5 8h7M3.5 12h9" /></Glyph> },
    { value: "right", title: "Right", icon: <Glyph><path d="M2.5 4h11M6.5 8h7M4.5 12h9" /></Glyph> },
  ];
  // Bars standing for the items, placed as the choice would place them. They are drawn
  // for a row and turned a quarter for a column.
  const bars = (xs: number[], y: number, h: number) => (
    <span className={column ? "rotate-90" : ""}>
      <Glyph>
        {xs.map((x) => (
          <rect key={x} x={x} y={y} width="2.5" height={h} rx="0.75" />
        ))}
      </Glyph>
    </span>
  );

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="flex flex-1 flex-col gap-4">
        {element ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-medium text-foreground">{`<${element.tagName.toLowerCase()}>`}</p>
              {session.has(element) ? (
                <button
                  type="button"
                  onClick={() => {
                    session.reset(element);
                    bump();
                  }}
                  className="rounded-[var(--r-full)] bg-tile px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground"
                >
                  Reset
                </button>
              ) : null}
            </div>

            {text !== null ? (
              <Section title="Copy">
                <textarea
                  key={`text:${text}`}
                  defaultValue={text}
                  rows={Math.min(6, text.split("\n").length + 1)}
                  onBlur={(event) => {
                    if (event.target.value === text) return;
                    session.setText(element, event.target.value);
                    bump();
                  }}
                  className="w-full resize-y rounded-[var(--r-md)] bg-surface-inset p-2 text-sm leading-[var(--leading-relaxed)] text-foreground outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                />
                <p className="text-xs text-foreground-subtle">Or double-click the text in the prototype.</p>
              </Section>
            ) : null}

            {picture ? (
              <Section title="Image">
                <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-[var(--r-md)] bg-surface-inset px-3 text-sm text-foreground-muted hover:text-foreground">
                  Replace image…
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      session.setImage(element, file);
                      bump();
                    }}
                    className="sr-only"
                  />
                </label>
              </Section>
            ) : null}

            {flex ? (
              <Section title="Layout">
                <Choice
                  label="Direction"
                  value={column ? "column" : "row"}
                  onChange={(value) => set(["flex-direction", value])}
                  options={[
                    { value: "row", title: "Row", icon: <Glyph><path d="M2.5 8h11M10.5 5l3 3-3 3" /></Glyph> },
                    { value: "column", title: "Column", icon: <Glyph><path d="M8 2.5v11M5 10.5l3 3 3-3" /></Glyph> },
                  ]}
                />
                <Choice
                  label="Justify"
                  value={read("justify-content")}
                  onChange={(value) => set(["justify-content", value])}
                  options={[
                    { value: "flex-start", title: "Start", icon: bars([2, 5.5], 4, 8) },
                    { value: "center", title: "Centre", icon: bars([5.5, 8.5], 4, 8) },
                    { value: "flex-end", title: "End", icon: bars([8.5, 11.5], 4, 8) },
                    { value: "space-between", title: "Space between", icon: bars([2, 11.5], 4, 8) },
                    { value: "space-around", title: "Space around", icon: bars([4, 9.5], 4, 8) },
                  ]}
                />
                <Choice
                  label="Align"
                  value={read("align-items")}
                  onChange={(value) => set(["align-items", value])}
                  options={[
                    { value: "flex-start", title: "Start", icon: bars([4.5, 9], 2, 6) },
                    { value: "center", title: "Centre", icon: bars([4.5, 9], 5, 6) },
                    { value: "flex-end", title: "End", icon: bars([4.5, 9], 8, 6) },
                    { value: "stretch", title: "Stretch", icon: bars([4.5, 9], 2, 12) },
                  ]}
                />
                <Row>
                  {linked(<Glyph><rect x="2" y="5" width="3.5" height="6" rx="0.75" /><rect x="10.5" y="5" width="3.5" height="6" rx="0.75" /></Glyph>, "Gap", [
                    { property: "column-gap", tag: "↔", name: "between columns" },
                    { property: "row-gap", tag: "↕", name: "between rows" },
                  ])}
                </Row>
              </Section>
            ) : null}

            <Section title="Size">
              <Row>
                <NumberField glyph={<span className="text-xs">W</span>} label="Width" value={read("width")} onCommit={(value) => set(["width", value])} />
                <NumberField glyph={<span className="text-xs">H</span>} label="Height" value={read("height")} onCommit={(value) => set(["height", value])} />
              </Row>
            </Section>

            <Section title="Spacing">
              <p className="text-xs text-foreground-subtle">Padding</p>
              <Row>
                {linked(<Glyph><path d="M2.5 3v10M13.5 3v10M5.5 8h5" /></Glyph>, "Padding, left and right", [
                  { property: "padding-left", tag: "L", name: "left" },
                  { property: "padding-right", tag: "R", name: "right" },
                ])}
                {linked(<Glyph><path d="M3 2.5h10M3 13.5h10M8 5.5v5" /></Glyph>, "Padding, top and bottom", [
                  { property: "padding-top", tag: "T", name: "top" },
                  { property: "padding-bottom", tag: "B", name: "bottom" },
                ])}
              </Row>
              <p className="text-xs text-foreground-subtle">Margin</p>
              <Row>
                {linked(<Glyph><path d="M2.5 3v10M13.5 3v10M5.5 8h5" /></Glyph>, "Margin, left and right", [
                  { property: "margin-left", tag: "L", name: "left" },
                  { property: "margin-right", tag: "R", name: "right" },
                ])}
                {linked(<Glyph><path d="M3 2.5h10M3 13.5h10M8 5.5v5" /></Glyph>, "Margin, top and bottom", [
                  { property: "margin-top", tag: "T", name: "top" },
                  { property: "margin-bottom", tag: "B", name: "bottom" },
                ])}
              </Row>
            </Section>

            <Section title="Appearance">
              <Row>
                {linked(<Glyph><path d="M3 13V8a5 5 0 0 1 5-5h5" /></Glyph>, "Corner radius", [
                  { property: "border-top-left-radius", tag: "TL", name: "top left" },
                  { property: "border-top-right-radius", tag: "TR", name: "top right" },
                  { property: "border-bottom-right-radius", tag: "BR", name: "bottom right" },
                  { property: "border-bottom-left-radius", tag: "BL", name: "bottom left" },
                ])}
                <NumberField
                  glyph={<Glyph><circle cx="8" cy="8" r="5.25" /><path d="M8 2.75a5.25 5.25 0 0 1 0 10.5Z" fill="currentColor" /></Glyph>}
                  label="Opacity, percent"
                  unit="opacity"
                  value={read("opacity")}
                  onCommit={(value) => set(["opacity", value])}
                />
              </Row>
            </Section>

            <Section title="Fill">
              <ColorField label="Background" value={read("background-color")} onCommit={(value) => set(["background-color", value])} />
            </Section>

            <Section title="Stroke">
              <Row>
                <ColorField label="Border colour" value={read("border-top-color")} onCommit={(color) => border({ color })} />
                <NumberField
                  glyph={<Glyph><path d="M2.5 4h11M2.5 8h11M2.5 12.25h11" strokeWidth="2" /></Glyph>}
                  label="Border width"
                  value={read("border-top-width")}
                  onCommit={(width) => border({ width })}
                />
              </Row>
              <Choice
                label="Border style"
                value={read("border-top-style")}
                onChange={(style) => border({ style })}
                options={[
                  { value: "solid", title: "Solid", icon: <Glyph><path d="M2.5 8h11" /></Glyph> },
                  { value: "dashed", title: "Dashed", icon: <Glyph><path d="M2.5 8h2.5M6.75 8h2.5M11 8h2.5" /></Glyph> },
                  { value: "dotted", title: "Dotted", icon: <Glyph><path d="M3 8h.01M6 8h.01M9 8h.01M12 8h.01" strokeWidth="2" /></Glyph> },
                ]}
              />
            </Section>

            {hasText ? (
              <Section title="Type">
                <Row>
                  <NumberField glyph={<span className="text-xs">Tt</span>} label="Font size" value={read("font-size")} onCommit={(value) => set(["font-size", value])} />
                  <NumberField
                    glyph={<Glyph><path d="M3 2.5h10M3 13.5h10M8 5.5v5" /></Glyph>}
                    label="Line height"
                    value={read("line-height")}
                    onCommit={(value) => set(["line-height", value])}
                  />
                </Row>
                <Choice
                  label="Weight"
                  value={String(Math.round(parseInt(read("font-weight") || "400", 10) / 100) * 100)}
                  onChange={(value) => set(["font-weight", value])}
                  options={["300", "400", "500", "600", "700"].map((weight) => ({
                    value: weight,
                    title: weight,
                    icon: <span style={{ fontWeight: weight }} className="text-sm">Aa</span>,
                  }))}
                />
                <Choice
                  label="Alignment"
                  value={["start", "left"].includes(read("text-align")) ? "left" : read("text-align") === "end" ? "right" : read("text-align")}
                  onChange={(value) => set(["text-align", value])}
                  options={alignment}
                />
                <ColorField label="Text colour" value={read("color")} onCommit={(value) => set(["color", value])} />
              </Section>
            ) : null}
          </>
        ) : (
          <p className="text-sm leading-[var(--leading-relaxed)] text-foreground-subtle">
            Click anything in the prototype to change it, and double-click text to type into it. It changes right here; nothing is saved until you save.
          </p>
        )}
      </div>

    </div>
  );
}
