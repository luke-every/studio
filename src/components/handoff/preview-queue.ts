"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Previews are heavy (a page of the prototype, or a component with React and Tailwind in a frame of its own), so they
 * are loaded a few at a time, the nearest first, instead of all at once or only when they are looked at:
 *
 *  - the finding on screen has priority 0, the ones after it 1, 2, 3 by how soon they will be reached;
 *  - at most `LIMIT` are loading at any moment, so the machine and the prototype's dev server are never swamped;
 *  - one that finishes (drawn, failed or given up on) hands its place to the next.
 *
 * A preview asks with `useLoadSlot(priority)`, draws nothing heavy until `go`, and says `done()` when it has finished.
 */
const LIMIT = 3;

type Ticket = { priority: number; started: boolean; finished: boolean; wake: () => void };
const tickets = new Set<Ticket>();

function pump() {
  const loading = [...tickets].filter((ticket) => ticket.started && !ticket.finished).length;
  const room = LIMIT - loading;
  if (room <= 0) return;
  [...tickets]
    .filter((ticket) => !ticket.started)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, room)
    .forEach((ticket) => {
      ticket.started = true;
      ticket.wake();
    });
}

export function useLoadSlot(priority: number) {
  const [go, setGo] = useState(false);
  const ticket = useRef<Ticket | null>(null);

  useEffect(() => {
    const mine: Ticket = { priority, started: false, finished: false, wake: () => setGo(true) };
    ticket.current = mine;
    tickets.add(mine);
    pump();
    return () => {
      mine.finished = true;
      tickets.delete(mine);
      pump();
    };
    // The priority is kept up to date by the effect below; the ticket is made once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ticket.current) return;
    ticket.current.priority = priority;
    pump();
  }, [priority]);

  const done = useCallback(() => {
    const mine = ticket.current;
    if (!mine || mine.finished) return;
    mine.finished = true;
    pump();
  }, []);

  return { go, done };
}
