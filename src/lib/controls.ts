import { z } from "zod";

import { VARIANT_PARAM } from "./edits";

/**
 * Controls a prototype offers to the studio.
 *
 * A prototype opts in by putting a `studio.json` beside its `index.html`.
 * The studio reads it, shows the controls beside the prototype, and turns
 * each choice into a URL parameter on the prototype's address — so the
 * prototype needs no studio code in it, and opened directly it has no
 * controls at all. Each version carries its own file, so its controls always
 * match its code.
 *
 * Leaving a control at its `default` adds nothing to the address: the
 * default is whatever the prototype does when the parameter is absent.
 *
 * A prototype that also speaks the studio's small message protocol (see
 * docs/controls.md) is sent changes instead of being reloaded.
 */

const common = {
  id: z.string().min(1),
  label: z.string().min(1),
  /** The URL parameter this sets. Defaults to the id. */
  param: z.string().min(1).optional(),
  /** Only offered while another control has this value. */
  when: z.object({ control: z.string(), is: z.string() }).optional(),
};

const choiceControl = z.object({
  ...common,
  type: z.literal("choice"),
  /** This control picks between variants of the prototype, which the canvas lays out side by side. Optional when it is the only choice. */
  variants: z.boolean().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).min(2),
  default: z.string(),
});

const toggleControl = z.object({
  ...common,
  type: z.literal("toggle"),
  /** What the parameter is set to while it is on. */
  value: z.string().default("1"),
  default: z.boolean().default(false),
});

const rangeControl = z.object({
  ...common,
  type: z.literal("range"),
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  default: z.number(),
});

const multiControl = z.object({
  ...common,
  type: z.literal("multi"),
  /** Values must not contain a comma: the chosen ones travel as one comma-separated parameter. */
  options: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
  /** The values on to start with. */
  default: z.array(z.string()).default([]),
});

export const controlsSchema = z.object({
  controls: z.array(z.discriminatedUnion("type", [choiceControl, toggleControl, rangeControl, multiControl])).default([]),
});

export type Control = z.infer<typeof controlsSchema>["controls"][number];
export type Controls = z.infer<typeof controlsSchema>;
/** A control's current value: the option's value, "on" / "off" for a toggle, the number as text for a range, the chosen values joined by commas (in option order) for a multi. */
export type ControlValues = Record<string, string>;

/** The chosen values of a multi as its value: in the order of its options, so the same choice always reads the same. */
export const multiValue = (control: Extract<Control, { type: "multi" }>, chosen: string[]) =>
  control.options.filter((option) => chosen.includes(option.value)).map((option) => option.value).join(",");

const defaultOf = (control: Control) =>
  control.type === "toggle" ? (control.default ? "on" : "off") : control.type === "multi" ? multiValue(control, control.default) : String(control.default);

export function defaultValues(controls: Controls | null): ControlValues {
  return Object.fromEntries((controls?.controls ?? []).map((control) => [control.id, defaultOf(control)]));
}

/** The controls to show now, given what the others are set to. */
export function visibleControls(controls: Controls, values: ControlValues) {
  return controls.controls.filter(
    (control) => !control.when || values[control.when.control] === control.when.is,
  );
}

/** The URL parameters every non-default, visible control stands for: what applyControls puts on the address, and what a live prototype is sent. */
export function controlParams(controls: Controls | null, values: ControlValues) {
  const params: Record<string, string> = {};
  if (!controls) return params;

  for (const control of visibleControls(controls, values)) {
    const value = values[control.id] ?? defaultOf(control);
    if (value === defaultOf(control)) continue;
    // A toggle that is on by default is only ever sent when it is off, so it says off ("0") rather than its on value.
    params[control.param ?? control.id] = control.type === "toggle" ? (value === "on" ? control.value : "0") : value;
  }
  return params;
}

/** The prototype's address with every non-default, visible control applied. */
export function applyControls(url: string, controls: Controls | null, values: ControlValues) {
  const query = new URLSearchParams(controlParams(controls, values)).toString();
  return query ? `${url}?${query}` : url;
}

/**
 * Asks for a prototype's page as a preview (a canvas screen, a tile): no video or audio, and storage of its own (see the
 * /p route). Its value changes whenever what a preview is does, since a page is cached for good under its address.
 */
export const PREVIEW_QUERY = "preview=2";

/** Tells a prototype it is shown inside the studio (so it can hide its own switcher). For iframes only, never thumbnails. */
export const EMBED_PARAM = "studio";
export const embedded = (url: string) => `${url}${url.includes("?") ? "&" : "?"}${EMBED_PARAM}=1`;

/** The control whose options are the prototype's variants: the one marked, else the only choice there is. */
export function variantControl(controls: Controls | null) {
  const choices = (controls?.controls ?? []).filter((control): control is Extract<Control, { type: "choice" }> => control.type === "choice");
  return choices.find((control) => control.variants) ?? (choices.length === 1 ? choices[0] : undefined);
}

/** A prototype's address split into what its controls say, as their values, and the rest of its own place. The studio's own keys (its flag, a studio variant, a phone's review token) are neither. */
export function splitQuery(query: string, controls: Controls | null) {
  const declared = new Map((controls?.controls ?? []).map((control) => [control.param ?? control.id, control]));
  const values: ControlValues = {};
  const extra: Record<string, string> = {};
  new URLSearchParams(query).forEach((value, key) => {
    if (key === VARIANT_PARAM || key === EMBED_PARAM || key === "review") return;
    const control = declared.get(key);
    // A toggle on by default is only ever in the address when it is off ("0"); one off by default, when it is on.
    if (control) values[control.id] = control.type === "toggle" ? (value === "0" ? "off" : "on") : value;
    else extra[key] = value;
  });
  return { values, extra };
}

/** The controls a setup sets, in words: an option's label, a toggle's name, a range's name and value. Others in the query are left out. */
export function controlsInWords(setup: string, controls: Controls | null) {
  const params = new URLSearchParams(setup);
  const parts: string[] = [];
  for (const control of controls?.controls ?? []) {
    const raw = params.get(control.param ?? control.id);
    if (raw === null) continue;
    parts.push(
      control.type === "toggle"
        ? control.label
        : control.type === "range"
          ? `${control.label} ${raw}`
          : control.type === "multi"
            ? raw
                .split(",")
                .filter(Boolean)
                .map((value) => control.options.find((option) => option.value === value)?.label ?? value)
                .join(", ") || `No ${control.label}`
            : (control.options.find((option) => option.value === raw)?.label ?? raw),
    );
  }
  return parts;
}
