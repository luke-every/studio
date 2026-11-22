"use client";

import { useEffect, useState } from "react";

import { TERMINAL_HOST, useStarts } from "@/lib/terminal";

/** What Fork on a component instance does: makes the project's own copy of it (true when it is made). Null where it can't (not on this machine, or the helper isn't running). */
export type EditComponent = {
  fork: (id: string) => Promise<boolean>;
  /**
   * Takes an element out into a component of its own, free of the page: the component it is the top of, with what it has now, or the element as markup with the props it uses.
   * `loc` is where it is written (`file:line:column`), when it is in the project's own code. What was made, or null (the problem is said).
   */
  extract: (request: { loc?: string; top?: unknown; owners?: unknown; markup?: string }) => Promise<{ id: string; label: string; existing: boolean; shared: boolean; snapshot?: boolean } | null>;
  /** Makes a fork the owner of a component it uses, so a change inside it is the fork's and not the shared original's (true when it is). */
  forkNested: (id: string, name: string) => Promise<boolean>;
  /** Says a problem the way the rest does. */
  problem: (message: string) => void;
  busy: boolean;
};

/** What the helper said at the end of a conversation: an `error`, or `done` with what it made. */
type Said = { error?: string; done?: { id?: string; label?: string; existing?: boolean; shared?: boolean; snapshot?: boolean; tagged?: string } };

/** One conversation with the helper: it says what it is doing and ends with `done` or an `error`. */
function conversation(path: string, params: Record<string, string>, send?: unknown) {
  return new Promise<Said>((resolve) => {
    const socket = new WebSocket(`ws://${TERMINAL_HOST}${path}?${new URLSearchParams(params)}`);
    let settled = false;
    // What is asked can be more than an address holds (the props of a component), so it is said once the connection is open.
    if (send !== undefined) socket.onopen = () => socket.send(JSON.stringify(send));
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as Said;
      if (message.error || message.done) {
        settled = true;
        socket.close();
        resolve(message);
      }
    };
    socket.onclose = () => {
      if (!settled) resolve({ error: "Lost the connection to the helper on this machine. Check that it is running, then try again." });
    };
  });
}

const ask = (path: string, params: Record<string, string>) => conversation(path, params).then((said) => said.error ?? null);

/**
 * Fork on a component: a project that is still only a canvas is first set up as an app (the blank starter, as adding a template does); then the helper
 * copies the component into it and records what it is a copy of. The canvas then draws that instance from the copy. A project that was only a canvas has
 * no running copy of itself to draw it from until the page is opened again, so it is, a moment later, once the canvas has been kept.
 */
export function useEditComponent(slug: string, blank: boolean, onProblem: (message: string) => void): EditComponent | null {
  const starts = useStarts();
  const [busy, setBusy] = useState(false);
  // A project is set up as its canvas opens, so that its elements say where they are written (that is what lets them be taken out and edited in code). Its server reads that once:
  // if the setup was only just made, it is said to restart it.
  useEffect(() => {
    if (!starts || blank) return;
    void conversation("/tag", { slug }).then((said) => {
      if (said.done?.tagged === "added" || said.done?.tagged === "updated") onProblem("This project was just set up so its elements can be taken out and edited in code. Restart its server once, then reload.");
    });
    // The setup is asked for once for each project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starts, blank, slug]);
  if (!starts) return null;
  return {
    busy,
    fork: async (id) => {
      if (busy) return false;
      setBusy(true);
      const problem = (blank ? await ask("/new", { kind: "template", slug, template: "blank" }) : null) ?? (await ask("/fork", { slug, id }));
      setBusy(false);
      if (problem) {
        onProblem(problem);
        return false;
      }
      if (blank) window.setTimeout(() => window.location.assign(`/prototypes/${slug}?canvas=1`), 1200);
      return true;
    },
    extract: async (request) => {
      if (busy) return null;
      setBusy(true);
      const said = await conversation("/extract", { slug }, request);
      setBusy(false);
      if (said.error || !said.done?.id) {
        onProblem(said.error ?? "It couldn't be taken out.");
        return null;
      }
      return { id: said.done.id, label: said.done.label ?? said.done.id, existing: !!said.done.existing, shared: !!said.done.shared, snapshot: !!said.done.snapshot };
    },
    forkNested: async (id, name) => {
      if (busy) return false;
      setBusy(true);
      const said = await conversation("/forknested", { slug, id, name });
      setBusy(false);
      if (said.error) onProblem(said.error);
      return !said.error;
    },
    problem: onProblem,
  };
}
