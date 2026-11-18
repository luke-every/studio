"use client";

import { useEffect, useState } from "react";

/** One component in the panel: what it is called, where it sits in the website's code, and its picture (if one could be made). */
export type CatalogueItem = {
  id: string;
  title: string;
  label: string;
  group: string;
  /** The picture's file; null when it couldn't be made. */
  file: string | null;
  /** The component's own size, in pixels: what a picture dragged out of the panel is drawn at. */
  width: number;
  height: number;
  stories: number;
};

export type Catalogue = { key: string | null; items: CatalogueItem[] };

/** Asked for once per page load and kept: the list is small, and the pictures are cached by the browser. */
let asked: Promise<Catalogue> | null = null;

function load() {
  asked ??= fetch("/api/catalogue")
    .then((response) => (response.ok ? (response.json() as Promise<Catalogue>) : { key: null, items: [] }))
    .catch(() => ({ key: null, items: [] }));
  return asked;
}

/** The components panel's list. Nothing is asked for until `wanted`, so a page that never opens the panel never pays for it. */
export function useCatalogue(wanted: boolean) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  useEffect(() => {
    if (!wanted || catalogue) return;
    let stale = false;
    void load().then((loaded) => {
      if (!stale) setCatalogue(loaded);
    });
    return () => {
      stale = true;
    };
  }, [wanted, catalogue]);
  return catalogue;
}
