"use client";

import { useReducer, type ReactNode } from "react";

import type { EditSession } from "@/components/prototype/use-edit-session";
import { Check, Choice, ColorField, Field, Glyph, NumberField, PanelButton, Row, Section, SelectField } from "@/components/prototype/edit-fields";
import { parseShadow, pictureOf, rgbaOf, shadowCss, sizeProperties, sizingOf, textOf, toRgba, type Axis, type Shadow, type Sizing } from "@/lib/edit-dom";

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
  // The picture to swap: this element's, or a background image on something around it.
  const picture = element ? pictureOf(element) : null;
  const flex = css ? css.display.includes("flex") || css.display.includes("grid") : false;
  const column = read("flex-direction").startsWith("column");
  const inFlexParent = element?.parentElement && view ? /flex|grid/.test(view.getComputedStyle(element.parentElement).display) : false;
  const positioned = read("position") !== "static";
  const shadow = parseShadow(read("box-shadow"));
  const SHADOW: Shadow = { x: 0, y: 4, blur: 12, spread: 0, color: "rgba(0, 0, 0, 0.2)" };
  const setShadow = (change: Partial<Shadow>) => set(["box-shadow", shadowCss({ ...(shadow ?? SHADOW), ...change })]);
  const blurOf = (property: string) => read(property).match(/blur\(([\d.]+)px\)/)?.[1] ?? "0";
  const sizing = (axis: Axis) => (element ? sizingOf(element, axis) : "fixed");
  /** How big it is along an axis: its own size, or what it fills or hugs, as a mode with the number only when fixed. */
  const dimension = (axis: Axis, caption: string) => {
    const mode = sizing(axis);
    return (
      <>
        <SelectField
          caption={caption}
          label={`${caption} sizing`}
          value={mode}
          onChange={(next) => element && set(...sizeProperties(element, axis, next as Sizing, parseFloat(read(axis)) || 0))}
          options={[
            { value: "fixed", label: "Fixed" },
            { value: "fill", label: "Fill" },
            { value: "hug", label: "Hug" },
          ]}
        />
        {mode === "fixed" ? (
          <NumberField
            caption=" "
            glyph={<span className="text-xs">{axis === "width" ? "W" : "H"}</span>}
            label={caption}
            value={read(axis)}
            onCommit={(value) => set([axis, value])}
          />
        ) : (
          <Field caption=" ">
            <span className="flex h-7 items-center px-1.5 text-xs text-foreground-muted">{Math.round(parseFloat(read(axis)) || 0)} px now</span>
          </Field>
        )}
      </>
    );
  };
  const hasText = element ? [...element.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) : false;

  /** Set one or more properties on the picked element. */
  const set = (...pairs: [string, string][]) => {
    if (!element) return;
    session.setStyles(element, Object.fromEntries(pairs));
    bump();
  };
  /**
   * One value that stands for several properties (both sides, all corners)
   * while they agree, and one field each when they don't, so every one of them
   * can be seen and changed.
   */
  const linked = (glyph: ReactNode, label: string, parts: { property: string; tag: string; name: string }[], caption?: string) => {
    const values = parts.map((part) => (read(part.property) === "normal" ? "0px" : read(part.property)));
    if (values.every((value) => value === values[0])) {
      return (
        <NumberField
          glyph={glyph}
          label={label}
          caption={caption}
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
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col">
        {element ? (
          <>
            <div className="flex h-12 items-center justify-between gap-3 border-b border-divider px-4">
              <p className="text-sm font-medium text-foreground">{`<${element.tagName.toLowerCase()}>`}</p>
              {session.has(element) ? (
                <PanelButton
                  label="Reset this part"
                  onClick={() => {
                    session.reset(element);
                    bump();
                  }}
                >
                  Reset
                </PanelButton>
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
                  className="w-full resize-y rounded-[var(--r-md)] bg-surface-inset p-2 text-xs leading-[var(--leading-relaxed)] text-foreground outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                />
                <p className="text-xs text-foreground-muted">Or double-click the text in the prototype.</p>
              </Section>
            ) : null}

            {picture ? (
              <Section title={picture === element ? "Image" : "Background image"}>
                <label className="inline-flex h-7 cursor-pointer items-center justify-center rounded-[var(--r-md)] bg-surface-inset px-3 text-xs text-foreground-muted hover:text-foreground">
                  Replace image…
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      session.setImage(picture, file);
                      bump();
                    }}
                    className="sr-only"
                  />
                </label>
              </Section>
            ) : null}

            <Section title="Layout">
              <SelectField
                caption="Display"
                label="Display"
                value={read("display")}
                onChange={(value) => set(["display", value])}
                options={[
                  { value: "block", label: "Block" },
                  { value: "flex", label: "Flex" },
                  { value: "grid", label: "Grid" },
                  { value: "inline-block", label: "Inline block" },
                  { value: "inline", label: "Inline" },
                  { value: "none", label: "Hidden" },
                ]}
              />
              {flex ? (
                <>
                  <Choice
                    caption="Flow"
                    label="Direction"
                    value={column ? "column" : "row"}
                    onChange={(value) => set(["flex-direction", value])}
                    options={[
                      { value: "row", title: "Row", icon: <Glyph><path d="M2.5 8h11M10.5 5l3 3-3 3" /></Glyph> },
                      { value: "column", title: "Column", icon: <Glyph><path d="M8 2.5v11M5 10.5l3 3 3-3" /></Glyph> },
                    ]}
                  />
                  <Choice
                    caption="Justify"
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
                    caption="Align"
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
                  <SelectField
                    caption="Wrap"
                    label="Wrap"
                    value={read("flex-wrap")}
                    onChange={(value) => set(["flex-wrap", value])}
                    options={[
                      { value: "nowrap", label: "No wrap" },
                      { value: "wrap", label: "Wrap" },
                      { value: "wrap-reverse", label: "Wrap reverse" },
                    ]}
                  />
                  <Row>
                    {linked(<Glyph><rect x="2" y="5" width="3.5" height="6" rx="0.75" /><rect x="10.5" y="5" width="3.5" height="6" rx="0.75" /></Glyph>, "Gap", [
                      { property: "column-gap", tag: "↔", name: "between columns" },
                      { property: "row-gap", tag: "↕", name: "between rows" },
                    ], "Gap")}
                  </Row>
                </>
              ) : null}
              {inFlexParent ? (
                <Row>
                  <NumberField
                    caption="Grow"
                    unit="number"
                    glyph={<Glyph><path d="M2.5 8h11M5 5.5 2.5 8 5 10.5M11 5.5 13.5 8 11 10.5" /></Glyph>}
                    label="Flex grow"
                    value={read("flex-grow")}
                    onCommit={(value) => set(["flex-grow", value])}
                  />
                  <SelectField
                    caption="Align self"
                    label="Align self"
                    value={read("align-self")}
                    onChange={(value) => set(["align-self", value])}
                    options={[
                      { value: "auto", label: "Auto" },
                      { value: "flex-start", label: "Start" },
                      { value: "center", label: "Centre" },
                      { value: "flex-end", label: "End" },
                      { value: "stretch", label: "Stretch" },
                    ]}
                  />
                </Row>
              ) : null}
              <Row>{dimension("width", "Width")}</Row>
              <Row>{dimension("height", "Height")}</Row>
              <Check label="Clip content" checked={["hidden", "clip"].includes(read("overflow-x"))} onChange={(on) => set(["overflow", on ? "hidden" : "visible"])} />
            </Section>

            <Section title="Position">
              <Row>
                <SelectField
                  caption="Position"
                  label="Position"
                  value={read("position")}
                  onChange={(value) => set(["position", value])}
                  options={["static", "relative", "absolute", "fixed", "sticky"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
                />
                <NumberField caption="Layer" unit="number" glyph={<span className="text-xs">Z</span>} label="Layer (z-index)" value={read("z-index")} onCommit={(value) => set(["z-index", value])} />
              </Row>
              {positioned ? (
                <Row>
                  {(["top", "right", "bottom", "left"] as const).map((side) => (
                    <NumberField
                      key={side}
                      caption={side[0].toUpperCase() + side.slice(1)}
                      glyph={<span className="text-xs">{side[0].toUpperCase()}</span>}
                      label={`Offset from ${side}`}
                      value={read(side)}
                      onCommit={(value) => set([side, value])}
                    />
                  ))}
                </Row>
              ) : null}
            </Section>

            <Section title="Spacing">
              <Row>
                {(
                  [
                    ["top", "M3 2.5h10M8 5.5v5"],
                    ["right", "M13.5 3v10M10.5 8h-5"],
                    ["bottom", "M3 13.5h10M8 5.5v5"],
                    ["left", "M2.5 3v10M5.5 8h5"],
                  ] as const
                ).map(([side, path]) => (
                  <NumberField
                    key={side}
                    caption={`Padding ${side}`}
                    glyph={<Glyph><path d={path} /></Glyph>}
                    label={`Padding, ${side}`}
                    value={read(`padding-${side}`)}
                    onCommit={(value) => set([`padding-${side}`, value])}
                  />
                ))}
              </Row>
              <Row>
                {linked(<Glyph><path d="M2.5 3v10M13.5 3v10M5.5 8h5" /></Glyph>, "Margin, left and right", [
                  { property: "margin-left", tag: "L", name: "left" },
                  { property: "margin-right", tag: "R", name: "right" },
                ], "Horizontal margin")}
                {linked(<Glyph><path d="M3 2.5h10M3 13.5h10M8 5.5v5" /></Glyph>, "Margin, top and bottom", [
                  { property: "margin-top", tag: "T", name: "top" },
                  { property: "margin-bottom", tag: "B", name: "bottom" },
                ], "Vertical margin")}
              </Row>
            </Section>

            <Section
              title="Appearance"
              action={
                <PanelButton label={read("visibility") === "hidden" ? "Show" : "Hide"} onClick={() => set(["visibility", read("visibility") === "hidden" ? "visible" : "hidden"])}>
                  <Glyph>
                    <path d="M1.5 8s2.25-4.25 6.5-4.25S14.5 8 14.5 8 12.25 12.25 8 12.25 1.5 8 1.5 8Z" />
                    {read("visibility") === "hidden" ? <path d="m3 13 10-10" /> : <circle cx="8" cy="8" r="1.75" />}
                  </Glyph>
                </PanelButton>
              }
            >
              <Row>
                {linked(<Glyph><path d="M3 13V8a5 5 0 0 1 5-5h5" /></Glyph>, "Corner radius", [
                  { property: "border-top-left-radius", tag: "TL", name: "top left" },
                  { property: "border-top-right-radius", tag: "TR", name: "top right" },
                  { property: "border-bottom-right-radius", tag: "BR", name: "bottom right" },
                  { property: "border-bottom-left-radius", tag: "BL", name: "bottom left" },
                ], "Corner radius")}
                <NumberField
                  caption="Opacity"
                  glyph={<Glyph><circle cx="8" cy="8" r="5.25" /><path d="M8 2.75a5.25 5.25 0 0 1 0 10.5Z" fill="currentColor" /></Glyph>}
                  label="Opacity, percent"
                  unit="opacity"
                  value={read("opacity")}
                  onCommit={(value) => set(["opacity", value])}
                />
              </Row>
            </Section>

            <Section
              title="Fill"
              action={
                <PanelButton label="Remove fill" onClick={() => set(["background-color", "transparent"])}>
                  <Glyph><path d="M3.5 8h9" /></Glyph>
                </PanelButton>
              }
            >
              <ColorField label="Background" value={read("background-color")} onCommit={(value) => set(["background-color", value])} />
            </Section>

            <Section
              title="Shadow"
              action={
                shadow ? (
                  <PanelButton label="Remove shadow" onClick={() => set(["box-shadow", "none"])}>
                    <Glyph><path d="M3.5 8h9" /></Glyph>
                  </PanelButton>
                ) : (
                  <PanelButton label="Add shadow" onClick={() => setShadow({})}>
                    <Glyph><path d="M8 3.5v9M3.5 8h9" /></Glyph>
                  </PanelButton>
                )
              }
            >
              {shadow ? (
                <>
                  <Row>
                    <NumberField caption="X" glyph={<span className="text-xs">X</span>} label="Shadow x" value={`${shadow.x}px`} onCommit={(value) => setShadow({ x: parseFloat(value) || 0 })} />
                    <NumberField caption="Y" glyph={<span className="text-xs">Y</span>} label="Shadow y" value={`${shadow.y}px`} onCommit={(value) => setShadow({ y: parseFloat(value) || 0 })} />
                    <NumberField caption="Blur" glyph={<Glyph><circle cx="8" cy="8" r="4" strokeDasharray="1.5 2" /></Glyph>} label="Shadow blur" value={`${shadow.blur}px`} onCommit={(value) => setShadow({ blur: Math.max(0, parseFloat(value) || 0) })} />
                    <NumberField caption="Spread" glyph={<Glyph><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" /></Glyph>} label="Shadow spread" value={`${shadow.spread}px`} onCommit={(value) => setShadow({ spread: parseFloat(value) || 0 })} />
                  </Row>
                  <Row>
                    <ColorField
                      caption="Colour"
                      label="Shadow colour"
                      value={shadow.color}
                      onCommit={(hex) => {
                        const n = parseInt(hex.slice(1, 7), 16);
                        setShadow({ color: toRgba((n >> 16) & 255, (n >> 8) & 255, n & 255, rgbaOf(shadow.color)[3]) });
                      }}
                    />
                    <NumberField
                      caption="Opacity"
                      unit="opacity"
                      glyph={<Glyph><circle cx="8" cy="8" r="5.25" /><path d="M8 2.75a5.25 5.25 0 0 1 0 10.5Z" fill="currentColor" /></Glyph>}
                      label="Shadow opacity, percent"
                      value={String(rgbaOf(shadow.color)[3])}
                      onCommit={(alpha) => {
                        const [r, g, b] = rgbaOf(shadow.color);
                        setShadow({ color: toRgba(r, g, b, parseFloat(alpha)) });
                      }}
                    />
                  </Row>
                </>
              ) : (
                <p className="text-xs text-foreground-muted">No shadow. Add one with the plus.</p>
              )}
            </Section>

            <Section title="Blur">
              <Row>
                <NumberField
                  caption="Layer"
                  glyph={<Glyph><circle cx="8" cy="8" r="4" strokeDasharray="1.5 2" /></Glyph>}
                  label="Layer blur"
                  value={`${blurOf("filter")}px`}
                  onCommit={(value) => set(["filter", parseFloat(value) > 0 ? `blur(${parseFloat(value)}px)` : "none"])}
                />
                <NumberField
                  caption="Background"
                  glyph={<Glyph><rect x="3" y="3" width="10" height="10" rx="2" strokeDasharray="1.5 2" /></Glyph>}
                  label="Background blur"
                  value={`${blurOf("backdrop-filter")}px`}
                  onCommit={(value) => set(["backdrop-filter", parseFloat(value) > 0 ? `blur(${parseFloat(value)}px)` : "none"])}
                />
              </Row>
            </Section>

            <Section title="Stroke">
              <Row>
                <ColorField caption="Colour" label="Border colour" value={read("border-top-color")} onCommit={(color) => border({ color })} />
                <NumberField
                  caption="Weight"
                  glyph={<Glyph><path d="M2.5 4h11M2.5 8h11M2.5 12.25h11" strokeWidth="2" /></Glyph>}
                  label="Border width"
                  value={read("border-top-width")}
                  onCommit={(width) => border({ width })}
                />
              </Row>
              <Choice
                caption="Style"
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
                  <NumberField caption="Size" glyph={<span className="text-xs">Tt</span>} label="Font size" value={read("font-size")} onCommit={(value) => set(["font-size", value])} />
                  <NumberField
                    caption="Line height"
                    glyph={<Glyph><path d="M3 2.5h10M3 13.5h10M8 5.5v5" /></Glyph>}
                    label="Line height"
                    value={read("line-height")}
                    onCommit={(value) => set(["line-height", value])}
                  />
                </Row>
                <Choice
                  caption="Weight"
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
                  caption="Alignment"
                  label="Alignment"
                  value={["start", "left"].includes(read("text-align")) ? "left" : read("text-align") === "end" ? "right" : read("text-align")}
                  onChange={(value) => set(["text-align", value])}
                  options={alignment}
                />
                <Row>
                  <NumberField caption="Letter spacing" glyph={<Glyph><path d="M2.5 3v10M13.5 3v10M5.5 8h5" /></Glyph>} label="Letter spacing" value={read("letter-spacing")} onCommit={(value) => set(["letter-spacing", value])} />
                  <SelectField
                    caption="Style"
                    label="Font style"
                    value={read("font-style")}
                    onChange={(value) => set(["font-style", value])}
                    options={[
                      { value: "normal", label: "Normal" },
                      { value: "italic", label: "Italic" },
                    ]}
                  />
                </Row>
                <Row>
                  <SelectField
                    caption="Case"
                    label="Text transform"
                    value={read("text-transform")}
                    onChange={(value) => set(["text-transform", value])}
                    options={[
                      { value: "none", label: "As typed" },
                      { value: "uppercase", label: "Upper" },
                      { value: "lowercase", label: "Lower" },
                      { value: "capitalize", label: "Title" },
                    ]}
                  />
                  <SelectField
                    caption="Decoration"
                    label="Text decoration"
                    value={read("text-decoration-line")}
                    onChange={(value) => set(["text-decoration-line", value])}
                    options={[
                      { value: "none", label: "None" },
                      { value: "underline", label: "Underline" },
                      { value: "line-through", label: "Strikethrough" },
                    ]}
                  />
                </Row>
                <ColorField caption="Colour" label="Text colour" value={read("color")} onCommit={(value) => set(["color", value])} />
              </Section>
            ) : null}
          </>
        ) : (
          <p className="px-4 py-4 text-xs leading-[var(--leading-relaxed)] text-foreground-muted">
            Click anything in the prototype to change it, and double-click text to type into it. It changes right here; nothing is saved until you save.
          </p>
        )}
      </div>

    </div>
  );
}
