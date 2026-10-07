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

export const controlsSchema = z.object({
  controls: z.array(z.discriminatedUnion("type", [choiceControl, toggleControl])).default([]),
});

export type Control = z.infer<typeof controlsSchema>["controls"][number];
export type Controls = z.infer<typeof controlsSchema>;
/** A control's current value: the option's value, or "on" / "off" for a toggle. */
export type ControlValues = Record<string, string>;

const defaultOf = (control: Control) =>
  control.type === "toggle" ? (control.default ? "on" : "off") : control.default;

export function defaultValues(controls: Controls | null): ControlValues {
  return Object.fromEntries((controls?.controls ?? []).map((control) => [control.id, defaultOf(control)]));
}

/** The controls to show now, given what the others are set to. */
export function visibleControls(controls: Controls, values: ControlValues) {
  return controls.controls.filter(
    (control) => !control.when || values[control.when.control] === control.when.is,
  );
}

/** The prototype's address with every non-default, visible control applied. */
export function applyControls(url: string, controls: Controls | null, values: ControlValues) {
  if (!controls) return url;

  const params = new URLSearchParams();
  for (const control of visibleControls(controls, values)) {
    const value = values[control.id] ?? defaultOf(control);
    if (value === defaultOf(control)) continue;
    params.set(control.param ?? control.id, control.type === "toggle" ? control.value : value);
  }

  const query = params.toString();
  return query ? `${url}?${query}` : url;
}
