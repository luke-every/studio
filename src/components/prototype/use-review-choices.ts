"use client";

import { useEffect, useState } from "react";

import { setupOf } from "@/lib/comments";
import { controlParams, controlsSchema, defaultValues, variantControl, type Controls } from "@/lib/controls";
import type { EditsFile } from "@/lib/edits";

export type ReviewChoice = { setup: string; label: string };

type Offer = { made: { id: string; label: string }[]; controls: Controls | null };

/** What each version offered when it was read. A version never changes, so it is read once: asking again, from the dialog, is instant. */
const known = new Map<string, Offer>();

/**
 * What a version offers to look at, for asking somebody to review it: the prototype as it opens, the variants made in the studio
 * (`edits.json`), and the options of the control that switches between variants (`studio.json`). `ready` is false until both files
 * have answered, so "nothing else to choose" can be told from "not known yet". A setup is a query, empty for the baseline. Used
 * early (by the review menu, as the page opens) so that by the time somebody asks, it is already known.
 */
export function useReviewChoices(url: string | undefined, name: string) {
  const [, read] = useState(0);

  useEffect(() => {
    if (!url || known.has(url)) return;
    let current = true;
    const get = <T,>(file: string) =>
      fetch(`${url}/${file}`)
        .then((response) => (response.ok ? (response.json() as Promise<T>) : null))
        .catch(() => null);
    void Promise.all([get<EditsFile>("edits.json"), get<unknown>("studio.json")]).then(([edits, studio]) => {
      if (!current) return;
      const parsed = controlsSchema.safeParse(studio);
      known.set(url, { made: (edits?.variants ?? []).map(({ id, label }) => ({ id, label })), controls: parsed.success && parsed.data.controls.length ? parsed.data : null });
      read((count) => count + 1);
    });
    return () => {
      current = false;
    };
  }, [url]);

  const here = (url && known.get(url)) || null;
  const ready = !url || !!here;
  const list: ReviewChoice[] = [];
  const add = (setup: string, label: string) => list.some((one) => one.setup === setup) || list.push({ setup, label });
  if (here?.made.length) {
    add("", "Baseline");
    for (const item of here.made) add(setupOf(new URLSearchParams({ variant: item.id }).toString()) ?? "", item.label);
  }
  const control = variantControl(here?.controls ?? null);
  if (here && control) {
    for (const option of control.options) add(setupOf(new URLSearchParams(controlParams(here.controls, { ...defaultValues(here.controls), [control.id]: option.value })).toString()) ?? "", option.label);
  }
  // The prototype as it opens is always there; with nothing else to choose from it is simply the prototype.
  if (!list.some((one) => !one.setup)) list.unshift({ setup: "", label: list.length ? "Baseline" : name });
  return { ready, choices: list };
}
