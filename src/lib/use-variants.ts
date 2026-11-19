"use client";

import { useEffect, useState } from "react";

/** A component's variants: the same component shown another way (a story of it). */
export type Variant = { id: string; name: string };

let asked: Promise<Record<string, Variant[]>> | null = null;

/** Asked for once per page load and kept. */
function load() {
  asked ??= fetch("/api/catalogue/stories")
    .then((response) => (response.ok ? (response.json() as Promise<{ stories: Record<string, Variant[]> }>) : { stories: {} }))
    .then((body) => body.stories)
    .catch(() => ({}));
  return asked;
}

/** The variants of the component a story belongs to (itself among them), nothing until wanted. Empty when there is only the one. */
export function useVariants(story: string | undefined, wanted: boolean) {
  const [all, setAll] = useState<Record<string, Variant[]> | null>(null);
  useEffect(() => {
    if (!wanted || all) return undefined;
    let stale = false;
    void load().then((found) => {
      if (!stale) setAll(found);
    });
    return () => {
      stale = true;
    };
  }, [wanted, all]);
  const group = story ? all?.[story.split("--")[0]] : undefined;
  return group && group.length > 1 ? group : [];
}

/** A story's name as words: `WithItemsInCart` is "With items in cart". */
export const variantLabel = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])(?=[a-z])/g, (_, c: string) => ` ${c.toLowerCase()}`);
