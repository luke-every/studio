"use client";

import { useEffect, useReducer, useState, type ReactNode } from "react";

import { ComponentPanel } from "@/components/prototype/component-panel";
import { PanelEmpty } from "@/components/prototype/panel-empty";
import { CheckIcon, CopyIcon, PencilIcon } from "@/components/shell/nav-icons";
import type { EditSession } from "@/components/prototype/use-edit-session";
import { AlignGrid, Check, Choice, ColourField, FLOW_OPTIONS, Glyph, NumberField, PanelButton, PanelTitle, Row, Section, SelectField, SizeField, TokenField, type TokenOption } from "@/components/prototype/edit-fields";
import { parseShadow, rgbaOf, shadowCss, toHex, toRgba, type Axis, type Shadow, type Sizing } from "@/lib/edit-dom";
import type { Part } from "@/lib/edit-part";
import { designTokensOf } from "@/lib/registry/actions";

/**
 * Edit mode's side panel: the part of the prototype that was clicked, as
 * things to change, and the save for everything changed so far.
 *
 * Changes show on the real prototype as they are made. Saving is in the top
 * bar (see `EditBar`).
 *
 * It works from a description of the part (`Part`), not the element itself,
 * so it is the same panel for a page the studio reads directly and for a live
 * version's, which describes its own parts from another address.
 */
const CORNERS = ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"];
const SPACING = ["padding-top", "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-right", "margin-bottom", "margin-left"];

/** The minus at the end of an applied section's title: takes it off the part, and the section folds away. */
const removeButton = (label: string, onClick: () => void) => (
  <PanelButton label={label} onClick={onClick}>
    <Glyph><path d="M3.5 8h9" /></Glyph>
  </PanelButton>
);

export function EditPanel({ part: element, session, slug }: { part: Part | null; session: EditSession; slug: string }) {
  // Values are read from the page, so they are read again after each change.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  // Whether the corners are shown one by one: they always are while they differ.
  const [apart, setApart] = useState(false);
  // Spacing is shown for each side, not for top and bottom, left and right together; it always is while a pair differs.
  const [spread, setSpread] = useState(false);
  // The words were just copied: the button says so for a moment.
  const [copied, setCopied] = useState(false);
  // The copy field's key while it is being typed in, so the page's echo of each keystroke doesn't remount it.
  const [typing, setTyping] = useState<string | null>(null);
  // The design system's colours, from its stylesheet: the page can't say them (see `designTokens`).
  const [palette, setPalette] = useState<{ slug: string; colours: { name: string; value: string }[] } | null>(null);
  useEffect(() => {
    let stale = false;
    void designTokensOf(slug).then((result) => {
      if (!stale && result.ok) setPalette({ slug, colours: result.value });
    });
    return () => {
      stale = true;
    };
  }, [slug]);
  // A design-system component instance (a live version) has its props to change, not styles.
  if (element?.component) return <ComponentPanel part={{ ...element, component: element.component }} slug={slug} session={session} />;

  const read = (property: string) => element?.css[property] ?? "";
  const text = element ? element.text : null;
  // While a line is being emptied, its field stays, empty.
  const words = text ?? "";
  // The picture to swap: this element's, or a background image on something around it.
  const picture = element ? element.picture : null;
  const flex = /flex|grid/.test(read("display"));
  const column = read("flex-direction").startsWith("column");
  const grid = /grid/.test(read("display"));
  // How it flows what is in it, as the frame panel says it: freeform when it does not, otherwise a column, a row or a grid.
  const flow = !flex ? "freeform" : grid ? "grid" : column ? "column" : "row";
  const columns = read("grid-template-columns").split(/\s+/).filter((track) => track && track !== "none").length;
  const inFlexParent = element ? /flex|grid/.test(element.parentDisplay) : false;
  const positioned = read("position") !== "static";
  const shadow = parseShadow(read("box-shadow"));
  const SHADOW: Shadow = { x: 0, y: 4, blur: 12, spread: 0, color: "rgba(0, 0, 0, 0.2)" };
  const setShadow = (change: Partial<Shadow>) => set(["box-shadow", shadowCss({ ...(shadow ?? SHADOW), ...change })]);
  const blurOf = (property: string) => read(property).match(/blur\(([\d.]+)px\)/)?.[1] ?? "0";
  const sizing = (axis: Axis) => (element ? element.sizing[axis] : "fixed");
  /** How big it is along an axis: a size when fixed, otherwise what it fills or hugs, in one field. */
  const dimension = (axis: Axis, caption: string) => (
    <SizeField
      glyph={<span className="text-xs">{axis === "width" ? "W" : "H"}</span>}
      label={caption}
      mode={sizing(axis)}
      value={read(axis)}
      onCommit={(value) => set([axis, value])}
      onMode={(next) => element && set(...element.sizes[axis][next])}
    />
  );
  const hasText = element ? element.hasText : false;
  // A section is open when the part has what it is about, and a plus when it doesn't.
  const px = (property: string) => parseFloat(read(property)) || 0;
  const radii = CORNERS.map(px);
  const cornersApart = apart || radii.some((value) => value !== radii[0]);
  const rounded = radii.some((value) => value > 0);
  const spaced = SPACING.some((property) => px(property) > 0);
  const mismatch = [["padding-top", "padding-bottom"], ["padding-left", "padding-right"], ["margin-top", "margin-bottom"], ["margin-left", "margin-right"]].some(([a, b]) => px(a) !== px(b));
  const sidesApart = spread || mismatch;
  const filled = !["transparent", "rgba(0, 0, 0, 0)"].includes(read("background-color")) || !["", "none"].includes(read("background-image"));
  const bordered = px("border-top-width") > 0 && read("border-top-style") !== "none";
  const blurred = parseFloat(blurOf("filter")) > 0 || parseFloat(blurOf("backdrop-filter")) > 0;

  /** Set one or more properties on the picked element. */
  const set = (...pairs: [string, string][]) => {
    if (!element) return;
    session.setStyles(element, Object.fromEntries(pairs));
    bump();
  };
  const border = (change: { width?: string; style?: string; color?: string }) => {
    const width = change.width ?? read("border-top-width");
    const style = change.style ?? (read("border-top-style") === "none" ? "solid" : read("border-top-style"));
    const color = change.color ?? read("border-top-color");
    set(["border", `${width} ${style} ${color}`]);
  };

  // Colours, radii and spacing are chosen from the page's design tokens; a value of any other kind is "Custom", last in the menu.
  const tokens = element?.tokens ?? { colours: [], radii: [], spacing: [] };
  const near = (token: { value: string }, pixels: number) => Math.abs(parseFloat(token.value) - pixels) < 0.01;
  const spaceOptions: TokenOption[] = tokens.spacing.map((token) => ({ key: token.name, label: `${token.value}px`, css: token.css }));
  const radiusOptions: TokenOption[] = [
    { key: "none", label: "None · 0", css: "0px" },
    ...tokens.radii.filter((token) => parseFloat(token.value) > 0).map((token) => ({ key: token.name, label: parseFloat(token.value) >= 9999 ? "Full" : `${token.name} · ${token.value}px`, css: token.css })),
  ];
  /** A typed size as CSS: a bare number is pixels. */
  const sizeCss = (text: string) => (/^-?[\d.]+$/.test(text.trim()) ? `${parseFloat(text)}px` : text.trim());
  /** A size on one or two properties together, from the tokens. Two numbers typed with a comma ("24, 32") are one for each. */
  const sized = (kind: "space" | "radius", glyph: ReactNode, label: string, properties: string[], value: string) => {
    const pixels = parseFloat(value) || 0;
    const key = kind === "space" ? (tokens.spacing.find((token) => near(token, pixels))?.name ?? null) : pixels === 0 ? "none" : (tokens.radii.find((token) => near(token, pixels))?.name ?? null);
    return (
      <TokenField
        glyph={glyph}
        label={label}
        options={kind === "space" ? spaceOptions : radiusOptions}
        selected={key}
        onPick={(option) => set(...properties.map((property): [string, string] => [property, option.css]))}
        custom={(menu) => (
          <NumberField
            glyph={glyph}
            label={label}
            value={value === "normal" ? "0px" : value}
            trailing={menu}
            onCommit={(text) => {
              const typed = text.split(/[,\s]+/).filter(Boolean);
              if (properties.length === 2 && typed.length === 2) set([properties[0], sizeCss(typed[0])], [properties[1], sizeCss(typed[1])]);
              else set(...properties.map((property): [string, string] => [property, sizeCss(typed[0] ?? text)]));
            }}
          />
        )}
      />
    );
  };
  const clear = (value: string) => value === "transparent" || /rgba\(.*,\s*0\)$/.test(value);
  /** Any CSS colour as the `#rrggbb` it is. */
  const hexOfCss = (css: string) => {
    const canvas = document.createElement("canvas").getContext("2d");
    if (!canvas) return css;
    canvas.fillStyle = "#000000";
    canvas.fillStyle = css;
    return canvas.fillStyle.startsWith("#") ? canvas.fillStyle : toHex(canvas.fillStyle);
  };
  // The stylesheet's colours when they came; otherwise any the page itself defines.
  const colours = palette?.slug === slug && palette.colours.length ? palette.colours.map((token) => ({ name: token.name, css: hexOfCss(token.value), value: hexOfCss(token.value) })) : tokens.colours;
  /** A colour from the tokens. `none` offers no colour; `alpha` false matches a token whatever the colour's own opacity. */
  const coloured = (label: string, value: string, pick: (option: TokenOption) => void, commit: (css: string) => void, { none = false, alpha = true } = {}) => {
    const options: TokenOption[] = [...(none ? [{ key: "none", label: "None", css: "transparent" }] : []), ...colours.map((token) => ({ key: token.name, label: token.name, css: token.css, hex: token.value }))];
    const hex = toHex(value);
    const key = clear(value) ? (none ? "none" : null) : alpha && rgbaOf(value)[3] < 1 ? null : (colours.find((token) => token.value.toLowerCase() === hex)?.name ?? null);
    return <ColourField label={label} options={options} selected={key} value={value} onPick={pick} onCommit={commit} />;
  };

  const alignment = [
    { value: "left", title: "Left", icon: <Glyph><path d="M2.5 4h11M2.5 8h7M2.5 12h9" /></Glyph> },
    { value: "center", title: "Centre", icon: <Glyph><path d="M2.5 4h11M4.5 8h7M3.5 12h9" /></Glyph> },
    { value: "right", title: "Right", icon: <Glyph><path d="M2.5 4h11M6.5 8h7M4.5 12h9" /></Glyph> },
  ];
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col">
        {element ? (
          <>
            <PanelTitle name={`<${element.tag}>`} note={element.inside ? `in ${element.inside}` : undefined} />
            {session.has(element.selector) ? (
              <div className="px-4 pt-3">
                <PanelButton
                  label="Reset this part"
                  onClick={() => {
                    session.reset(element.selector);
                    bump();
                  }}
                >
                  Reset
                </PanelButton>
              </div>
            ) : null}

            {picture && element.pictureKind === "img" ? (
              <Section title="Image">
                <ImageRow shown={session.imageOf(picture) ?? element.pictureSrc} onPick={(file) => void session.setImage(picture, file, element.pictureCopy).then(bump)} />
              </Section>
            ) : null}

            {text !== null || typing?.startsWith(`${element.selector}:`) ? (
              <Section
                title="Copy"
                action={
                  <PanelButton
                    label={copied ? "Copied" : "Copy text"}
                    onClick={() => {
                      navigator.clipboard.writeText(words).then(
                        () => {
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 1500);
                        },
                        () => {},
                      );
                    }}
                  >
                    {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                  </PanelButton>
                }
              >
                <textarea
                  // Refreshed from the page (an undo, a reset) except while it is being typed in, which would drop the caret.
                  key={typing ?? `${element.selector}:${words}`}
                  onFocus={() => setTyping(`${element.selector}:${words}`)}
                  defaultValue={words}
                  rows={Math.min(6, words.split("\n").length + 1)}
                  // Live: the prototype changes as it is typed.
                  onBlur={() => setTyping(null)}
                  onChange={(event) => {
                    session.setText(element, event.target.value);
                    bump();
                  }}
                  className="w-full resize-y rounded-[var(--r-md)] bg-surface-inset p-2 text-xs leading-[var(--leading-relaxed)] text-foreground outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                />
                <p className="text-xs text-foreground-muted">Or double-click the text in the prototype.</p>
              </Section>
            ) : null}

            {text === null && element.segments ? (
              <Section title="Copy">
                {element.segments.map((segment) => {
                  const id = `${element.selector}#${segment.index}`;
                  return (
                    <textarea
                      key={typing?.startsWith(`${id}:`) ? typing : `${id}:${segment.text}`}
                      defaultValue={segment.text}
                      aria-label="Text"
                      rows={Math.min(6, segment.text.split("\n").length + 1)}
                      onFocus={() => setTyping(`${id}:${segment.text}`)}
                      onBlur={() => setTyping(null)}
                      // Live: the prototype changes as it is typed, this piece of it and no other.
                      onChange={(event) => {
                        session.setText({ selector: element.selector, text: segment.text, copy: segment.copy, node: segment.index }, event.target.value);
                        bump();
                      }}
                      className="w-full resize-y rounded-[var(--r-md)] bg-surface-inset p-2 text-xs leading-[var(--leading-relaxed)] text-foreground outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                    />
                  );
                })}
              </Section>
            ) : null}

            {/* Inside a component its look is the component's: only its words can change. */}
            {element.inside ? null : (
              <>
            <Section title={flex ? "Auto layout" : "Layout"}>
              <Choice
                label="Flow"
                caption="Flow"
                value={flow}
                options={FLOW_OPTIONS}
                onChange={(value) => (value === "freeform" ? set(["display", "block"]) : value === "grid" ? set(["display", "grid"]) : set(["display", "flex"], ["flex-direction", value]))}
              />
              <Row>
                {dimension("width", "Width")}
                {dimension("height", "Height")}
              </Row>
              <Row>
                <SelectField
                  label="Position"
                  value={read("position")}
                  onChange={(value) => set(["position", value])}
                  options={["static", "relative", "absolute", "fixed", "sticky"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
                />
                <NumberField unit="number" glyph={<span className="text-xs">Z</span>} label="Layer (z-index)" value={read("z-index")} onCommit={(value) => set(["z-index", value])} />
              </Row>
              {positioned ? (
                <Row>
                  {(["top", "right", "bottom", "left"] as const).map((side) => (
                    <NumberField
                      key={side}
                      glyph={<span className="text-xs">{side[0].toUpperCase()}</span>}
                      label={`Offset from ${side}`}
                      value={read(side)}
                      onCommit={(value) => set([side, value])}
                    />
                  ))}
                </Row>
              ) : null}
              {inFlexParent ? (
                <Row>
                  <NumberField
                    unit="number"
                    glyph={<Glyph><path d="M2.5 8h11M5 5.5 2.5 8 5 10.5M11 5.5 13.5 8 11 10.5" /></Glyph>}
                    label="Grow"
                    value={read("flex-grow")}
                    onCommit={(value) => set(["flex-grow", value])}
                  />
                  <SelectField
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
              {flex && grid ? (
                <>
                  <NumberField
                    unit="number"
                    caption="Columns"
                    glyph={<Glyph><rect x="2" y="2" width="5" height="12" rx="1" /><rect x="9" y="2" width="5" height="12" rx="1" /></Glyph>}
                    label="Columns"
                    value={String(columns || 1)}
                    onCommit={(value) => set(["grid-template-columns", `repeat(${Math.max(1, Math.min(12, Math.round(Number(value)) || 1))}, minmax(0, 1fr))`])}
                  />
                  {sized("space", <Glyph><rect x="2" y="5" width="3.5" height="6" rx="0.75" /><rect x="10.5" y="5" width="3.5" height="6" rx="0.75" /></Glyph>, "Gap", ["column-gap", "row-gap"], read("column-gap"))}
                </>
              ) : null}
              {flex && !grid ? (
                <>
                  <div className="flex gap-2">
                    <AlignGrid column={column} justify={read("justify-content")} align={read("align-items")} onChange={(justify, align) => set(["justify-content", justify], ["align-items", align])} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {sized("space", <Glyph><rect x="2" y="5" width="3.5" height="6" rx="0.75" /><rect x="10.5" y="5" width="3.5" height="6" rx="0.75" /></Glyph>, "Gap", ["column-gap", "row-gap"], read(column ? "row-gap" : "column-gap"))}
                      <Choice
                        label="Wrap"
                        value={read("flex-wrap") === "nowrap" ? "nowrap" : "wrap"}
                        onChange={(value) => set(["flex-wrap", value])}
                        options={[
                          { value: "nowrap", title: "No wrap", icon: <Glyph><path d="M2.5 8h11" /></Glyph> },
                          { value: "wrap", title: "Wrap", icon: <Glyph><path d="M2.5 5h11M2.5 11h7" /></Glyph> },
                        ]}
                      />
                    </div>
                  </div>
                  <Check label="Space between" checked={read("justify-content") === "space-between"} onChange={(on) => set(["justify-content", on ? "space-between" : "flex-start"])} />
                </>
              ) : null}
              <Check label="Clip content" checked={["hidden", "clip"].includes(read("overflow-x"))} onChange={(on) => set(["overflow", on ? "hidden" : "visible"])} />
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
                {coloured("Text colour", read("color"), (option) => set(["color", option.css]), (value) => set(["color", value]))}
              </Section>
            ) : null}
            <Section
              title="Spacing"
              applied={spaced}
              onAdd={() => set(["padding-top", "8px"], ["padding-right", "8px"], ["padding-bottom", "8px"], ["padding-left", "8px"])}
              action={
                <>
                  {mismatch ? null : (
                    <PanelButton label={spread ? "Top and bottom, left and right together" : "Each side on its own"} onClick={() => setSpread(!spread)}>
                      <Glyph><path d="M2.5 6V4a1.5 1.5 0 0 1 1.5-1.5h2M10 2.5h2A1.5 1.5 0 0 1 13.5 4v2M13.5 10v2a1.5 1.5 0 0 1-1.5 1.5h-2M6 13.5H4A1.5 1.5 0 0 1 2.5 12v-2" /></Glyph>
                    </PanelButton>
                  )}
                  {removeButton("Remove spacing", () => set(...SPACING.map((property): [string, string] => [property, "0px"])))}
                </>
              }
            >
              {(["padding", "margin"] as const).map((kind) => {
                const sides = {
                  top: { path: kind === "padding" ? "M3 2.5h10M8 5.5v5" : "M3 2.5h10M3 13.5h10M8 5.5v5" },
                  right: { path: kind === "padding" ? "M13.5 3v10M10.5 8h-5" : "M2.5 3v10M13.5 3v10M5.5 8h5" },
                  bottom: { path: kind === "padding" ? "M3 13.5h10M8 5.5v5" : "M3 2.5h10M3 13.5h10M8 5.5v5" },
                  left: { path: kind === "padding" ? "M2.5 3v10M5.5 8h5" : "M2.5 3v10M13.5 3v10M5.5 8h5" },
                };
                const name = kind[0].toUpperCase() + kind.slice(1);
                const glyph = (side: keyof typeof sides) => <Glyph><path d={sides[side].path} /></Glyph>;
                return (
                  <div key={kind} className="flex flex-col gap-2">
                    <p className="text-xs text-foreground-muted">{name}</p>
                    {sidesApart ? (
                  <Row>
                    {(["top", "right", "bottom", "left"] as const).map((side) => (
                      <div key={side}>{sized("space", glyph(side), `${name}, ${side}`, [`${kind}-${side}`], read(`${kind}-${side}`))}</div>
                    ))}
                  </Row>
                ) : (
                  <Row>
                    <div>{sized("space", glyph("top"), `${name}, top and bottom`, [`${kind}-top`, `${kind}-bottom`], read(`${kind}-top`))}</div>
                    <div>{sized("space", glyph("left"), `${name}, left and right`, [`${kind}-left`, `${kind}-right`], read(`${kind}-left`))}</div>
                  </Row>
                    )}
                  </div>
                );
              })}
            </Section>

            <Section
              title="Radius"
              applied={rounded}
              onAdd={() => set(...CORNERS.map((property): [string, string] => [property, "8px"]))}
              action={
                <>
                  <PanelButton label={cornersApart ? "One radius for all corners" : "A radius for each corner"} onClick={() => setApart(!cornersApart)}>
                    <Glyph><path d="M2.5 6V4a1.5 1.5 0 0 1 1.5-1.5h2M10 2.5h2A1.5 1.5 0 0 1 13.5 4v2M13.5 10v2a1.5 1.5 0 0 1-1.5 1.5h-2M6 13.5H4A1.5 1.5 0 0 1 2.5 12v-2" /></Glyph>
                  </PanelButton>
                  {removeButton("Remove radius", () => set(...CORNERS.map((property): [string, string] => [property, "0px"])))}
                </>
              }
            >
              {cornersApart ? (
                <Row>
                  {(
                    [
                      ["border-top-left-radius", "TL", "top left"],
                      ["border-top-right-radius", "TR", "top right"],
                      ["border-bottom-left-radius", "BL", "bottom left"],
                      ["border-bottom-right-radius", "BR", "bottom right"],
                    ] as const
                  ).map(([property, tag, name]) => (
                    <div key={property}>{sized("radius", <span className="text-xs">{tag}</span>, `Radius, ${name}`, [property], read(property))}</div>
                  ))}
                </Row>
              ) : (
                sized("radius", <Glyph><path d="M3 13V8a5 5 0 0 1 5-5h5" /></Glyph>, "Corner radius", CORNERS, read(CORNERS[0]))
              )}
            </Section>

            <Section
              title="Blending"
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
                <NumberField
                  glyph={<Glyph><circle cx="8" cy="8" r="5.25" /><path d="M8 2.75a5.25 5.25 0 0 1 0 10.5Z" fill="currentColor" /></Glyph>}
                  label="Opacity, percent"
                  unit="opacity"
                  value={read("opacity")}
                  onCommit={(value) => set(["opacity", value])}
                />
                <SelectField
                  label="Blend mode"
                  value={read("mix-blend-mode")}
                  onChange={(value) => set(["mix-blend-mode", value])}
                  options={["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
                />
              </Row>
            </Section>

            <Section
              title="Fill"
              applied={filled || element.pictureKind === "fill"}
              onAdd={() => set(["background-color", "#ffffff"])}
              action={removeButton("Remove fill", () => set(["background-color", "transparent"], ["background-image", "none"]))}
            >
              {picture && element.pictureKind === "fill" ? <ImageRow shown={session.imageOf(picture) ?? element.pictureSrc} onPick={(file) => void session.setImage(picture, file, element.pictureCopy).then(bump)} /> : null}
              {coloured("Background", read("background-color"), (option) => set(["background-color", option.css]), (value) => set(["background-color", value]), { none: true })}
            </Section>

            <Section
              title="Border"
              applied={bordered}
              onAdd={() => border({ width: "1px", style: "solid", color: "#000000" })}
              action={removeButton("Remove border", () => set(["border", "none"]))}
            >
              <Row>
                {coloured("Border colour", read("border-top-color"), (option) => border({ color: option.css }), (color) => border({ color }))}
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

            <Section title="Shadow" applied={!!shadow} onAdd={() => setShadow({})} action={removeButton("Remove shadow", () => set(["box-shadow", "none"]))}>
              {shadow ? (
                <>
                  <Row>
                    <NumberField glyph={<span className="text-xs">X</span>} label="Shadow x" value={`${shadow.x}px`} onCommit={(value) => setShadow({ x: parseFloat(value) || 0 })} />
                    <NumberField glyph={<span className="text-xs">Y</span>} label="Shadow y" value={`${shadow.y}px`} onCommit={(value) => setShadow({ y: parseFloat(value) || 0 })} />
                    <NumberField glyph={<Glyph><circle cx="8" cy="8" r="4" strokeDasharray="1.5 2" /></Glyph>} label="Shadow blur" value={`${shadow.blur}px`} onCommit={(value) => setShadow({ blur: Math.max(0, parseFloat(value) || 0) })} />
                    <NumberField glyph={<Glyph><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" /></Glyph>} label="Shadow spread" value={`${shadow.spread}px`} onCommit={(value) => setShadow({ spread: parseFloat(value) || 0 })} />
                  </Row>
                  <Row>
                    {(() => {
                      // A shadow's colour is written out with its opacity, so a token is put in as its colour.
                      const colour = (hex: string) => {
                        const n = parseInt(hex.slice(1, 7), 16);
                        setShadow({ color: toRgba((n >> 16) & 255, (n >> 8) & 255, n & 255, rgbaOf(shadow.color)[3]) });
                      };
                      return coloured("Shadow colour", shadow.color, (option) => colour(option.hex ?? "#000000"), colour, { alpha: false });
                    })()}
                    <NumberField
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
              ) : null}
            </Section>

            <Section title="Filters" applied={blurred} onAdd={() => set(["filter", "blur(4px)"])} action={removeButton("Remove filters", () => set(["filter", "none"], ["backdrop-filter", "none"]))}>
              <Row>
                <NumberField
                  glyph={<Glyph><circle cx="8" cy="8" r="4" strokeDasharray="1.5 2" /></Glyph>}
                  label="Layer blur"
                  value={`${blurOf("filter")}px`}
                  onCommit={(value) => set(["filter", parseFloat(value) > 0 ? `blur(${parseFloat(value)}px)` : "none"])}
                />
                <NumberField
                  glyph={<Glyph><rect x="3" y="3" width="10" height="10" rx="2" strokeDasharray="1.5 2" /></Glyph>}
                  label="Background blur"
                  value={`${blurOf("backdrop-filter")}px`}
                  onCommit={(value) => set(["backdrop-filter", parseFloat(value) > 0 ? `blur(${parseFloat(value)}px)` : "none"])}
                />
              </Row>
            </Section>
              </>
            )}
          </>
        ) : (
          <PanelEmpty icon={<PencilIcon />}>
            Click anything in the prototype to change it, and double-click text to type into it. Nothing is saved until you save.
          </PanelEmpty>
        )}
      </div>

    </div>
  );
}

/** A picture and the way to change it: what it shows now, small, and a button to pick another from the disk. */
function ImageRow({ shown, onPick }: { shown: string | null; onPick: (file: File) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="size-14 shrink-0 overflow-hidden rounded-[var(--r-md)] bg-surface-inset">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" draggable={false} className="size-full object-cover" />
        ) : null}
      </span>
      <label className="inline-flex h-7 cursor-pointer items-center justify-center rounded-[var(--r-md)] bg-surface-inset px-3 text-xs text-foreground-muted hover:text-foreground">
        Replace…
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared, so choosing the same file again still counts.
            event.target.value = "";
            if (file) onPick(file);
          }}
          className="sr-only"
        />
      </label>
    </div>
  );
}
