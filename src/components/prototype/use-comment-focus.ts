"use client";

import { useEffect, useRef, useState } from "react";

import { setupOf, type Comment } from "@/lib/comments";
import type { Flow, FlowScreen } from "@/lib/flow";

type Ask = { id: string; at: number };

/**
 * Which comment is open over the prototype, and going to it: the setup it was left on (its controls, and the place the
 * prototype had put in its address), and its flow screen when it was left on the canvas. `at` counts up with every ask,
 * so asking for the same comment again goes to it again.
 *
 * A link from a notification names a comment (`?comment=`): it is gone to the same way, once the comments have loaded
 * and the setup it was left on can be shown.
 */
export function useCommentFocus({
  flow,
  screen,
  show,
  setup,
  everything,
  ready,
  onLinked,
}: {
  flow?: Flow | null;
  /** The flow screen on show, if one was chosen. */
  screen: FlowScreen | null;
  /** Shows a flow screen, from the start. */
  show: (screen: FlowScreen) => void;
  /** The setup on screen, and how to show another; none on a canvas of variants, where every setup is on screen. */
  setup?: { variant?: string; onSetup?: (setup: string) => void; canShow?: (setup?: string) => boolean };
  /** Every comment on the version, whatever its setup. */
  everything: Comment[];
  /** Whether the prototype is there to go to a comment in. */
  ready: boolean;
  /** A link has asked for a comment and it is being gone to: show the comments. */
  onLinked: () => void;
}) {
  const [focus, setFocus] = useState<Ask | null>(null);
  // Asks are counted for good, not from the one open: closing a comment and choosing another isn't asking the first again.
  const asks = useRef(0);

  const ask = (id: string | null) => {
    setFocus(id ? { id, at: ++asks.current } : null);
  };

  // Choosing a comment from the list: the setup it was left on, then the flow screen, if it was left on one.
  const goTo = (comment: Comment) => {
    ask(comment.id);
    if (setup?.onSetup && setupOf(comment.variant) !== setupOf(setup.variant)) {
      setup.onSetup(comment.variant ?? "");
      return;
    }
    const known = flow?.screens.find((item) => item.id === comment.anchor.flowScreen);
    if (known && known.id !== (screen ?? flow?.screens[0])?.id) show(known);
  };

  const [linked, setLinked] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("comment")));
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!linked) return undefined;
    const timer = window.setTimeout(() => setWaited(true), 4000);
    return () => window.clearTimeout(timer);
  }, [linked]);
  const linkedComment = linked ? everything.find((item) => item.id === linked) : undefined;
  const linkedReady = !!linkedComment && ready && (waited || (setup?.canShow?.(linkedComment.variant) ?? true));
  /* eslint-disable react-hooks/set-state-in-effect -- going to a comment is a reaction to it having arrived */
  useEffect(() => {
    if (!linkedReady || !linkedComment) return;
    setLinked(null);
    const here = new URL(window.location.href);
    here.searchParams.delete("comment");
    window.history.replaceState(null, "", here);
    onLinked();
    goTo(linkedComment);
    // Once, when it becomes ready; the rest is read from the render that sees it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedReady]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    focus,
    /** Opens a comment where it is showing (a pin pressed), or closes it with null. */
    ask,
    goTo,
  };
}
