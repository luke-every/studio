import { z } from "zod";

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

export const controlsSchema = z.object({
  controls: z.array(z.discriminatedUnion("type", [choiceControl, toggleControl, rangeControl])).default([]),
});

export type Control = z.infer<typeof controlsSchema>["controls"][number];
export type Controls = z.infer<typeof controlsSchema>;
/** A control's current value: the option's value, "on" / "off" for a toggle, the number as text for a range. */
export type ControlValues = Record<string, string>;

const defaultOf = (control: Control) =>
  control.type === "toggle" ? (control.default ? "on" : "off") : String(control.default);

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
    params[control.param ?? control.id] = control.type === "toggle" ? control.value : value;
  }
  return params;
}

/** The prototype's address with every non-default, visible control applied. */
export function applyControls(url: string, controls: Controls | null, values: ControlValues) {
  const query = new URLSearchParams(controlParams(controls, values)).toString();
  return query ? `${url}?${query}` : url;
}

/** Tells a prototype it is shown inside the studio (so it can hide its own switcher). For iframes only, never thumbnails. */
export const EMBED_PARAM = "studio";
export const embedded = (url: string) => `${url}${url.includes("?") ? "&" : "?"}${EMBED_PARAM}=1`;

/** The control whose options are the prototype's variants: the one marked, else the only choice there is. */
export function variantControl(controls: Controls | null) {
  const choices = (controls?.controls ?? []).filter((control): control is Extract<Control, { type: "choice" }> => control.type === "choice");
  return choices.find((control) => control.variants) ?? (choices.length === 1 ? choices[0] : undefined);
}
