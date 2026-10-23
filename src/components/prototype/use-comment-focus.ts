"use client";

import { useEffect, useRef, useState } from "react";

import type { Anchor, Comment } from "@/lib/comments";
import type { Flow, FlowScreen } from "@/lib/flow";

import { locateScreen } from "./locate-screen";

type Ask = { id: string; at: number };

/**
 * Which comment is open over the prototype, and going to it: its setup, its flow screen, and when neither is known, a
 * search of the flow's screens out of sight (`locateScreen`). `at` counts up with every ask, so asking for the same
 * comment again goes to it again, and each ask is looked for once at most. A newer ask stops an older one's search.
 *
 * A link from a notification names a comment (`?comment=`): it is gone to the same way, once the comments have loaded
 * and the setup it was left on can be shown.
 */
export function useCommentFocus({
  flow,
  address,
  size,
  screen,
  show,
  setup,
  everything,
  ready,
  place,
  onLinked,
}: {
  flow?: Flow | null;
  /** The prototype's address, which the flow's screens are put on. */
  address?: string;
  /** The frame's size, which a screen is looked at in. */
  size: { width: number; height: number };
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
  /** Notes the flow screen a comment was found on, exactly as it was left. */
  place: (comment: Comment, flowScreen: string) => Promise<void>;
  /** A link has asked for a comment and it is being gone to: show the comments. */
  onLinked: () => void;
}) {
  const [focus, setFocus] = useState<Ask | null>(null);
  // The ask a screen has been shown or searched for, so it is only done once.
  const [located, setLocated] = useState(0);
  const [searching, setSearching] = useState<number | null>(null);
  const search = useRef<AbortController | null>(null);
  // Asks are counted for good, not from the one open: closing a comment and choosing another isn't asking the first again.
  const asks = useRef(0);
  useEffect(() => () => search.current?.abort(), []);

  const ask = (id: string | null) => {
    search.current?.abort();
    const next = id ? { id, at: ++asks.current } : null;
    setFocus(next);
    return next;
  };

  // Asked for a comment that isn't to be found on the screen showing: show the flow screen it is on, or look for it.
  const locate = (comment: Comment) => {
    if (!flow || !address || !focus || located === focus.at) return false;
    setLocated(focus.at);
    const known = flow.screens.find((item) => item.id === comment.anchor.flowScreen);
    if (known) {
      show(known);
      return true;
    }
    const at = focus.at;
    const controller = new AbortController();
    search.current = controller;
    setSearching(at);
    void locateScreen(address, flow, size, comment.anchor, controller.signal).then((found) => {
      setSearching((now) => (now === at ? null : now));
      if (!found || controller.signal.aborted) return;
      show(found.screen);
      // Only somewhere it is exactly as it was is noted; the nearest is a guess for this person's prototype.
      if (found.exact) void place(comment, found.screen.id);
    });
    return true;
  };

  // Choosing a comment from the list. One noted as on another flow screen than the one open goes there at once, without
  // first looking for it on this one (where a step drawn over another can make it seem to be).
  const goTo = (comment: Comment) => {
    const next = ask(comment.id)!;
    // Left on another setup: show that one, and it is opened there once the prototype has it.
    if (setup?.onSetup && comment.variant !== setup.variant) {
      setup.onSetup(comment.variant ?? "");
      return;
    }
    const known = flow?.screens.find((item) => item.id === comment.anchor.flowScreen);
    if (known && address && known.id !== (screen ?? flow?.screens[0])?.id) {
      setLocated(next.at);
      show(known);
    }
  };

  // Leaving a comment: which flow screen it is on is found straight after, out of sight, so going to it later is instant.
  const placeNew = (posted: Comment, anchor: Anchor) => {
    if (!flow || !address || anchor.flowScreen) return;
    void locateScreen(address, flow, size, anchor).then((found) => void (found?.exact && place(posted, found.screen.id)));
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
    ask: (id: string | null) => void ask(id),
    goTo,
    locate,
    searching: searching !== null && searching === focus?.at,
    placeNew,
  };
}
