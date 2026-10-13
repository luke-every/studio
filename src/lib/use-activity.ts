"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { Activity } from "./activity";
import { listActivity } from "./registry/actions";
import { useUser } from "./use-user";

const SEEN_KEY = "proto.activity-seen";
const CHANGED = "proto:activity-seen";
const REFRESH_MS = 60_000;

function useSeen() {
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener("storage", listener);
    window.addEventListener(CHANGED, listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener(CHANGED, listener);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(SEEN_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
}

/**
 * What others have done lately, and how much of it this person hasn't looked
 * at. Which of it is read is this browser's own (per-person state stays on
 * the client); the list itself comes from the studio, on arrival, whenever
 * the tab is looked at again, and once a minute while it stays open.
 */
export function useActivity() {
  const { name } = useUser();
  const seen = useSeen();
  const [all, setAll] = useState<Activity[]>([]);

  const markSeen = useCallback((at: string) => {
    try {
      localStorage.setItem(SEEN_KEY, at);
    } catch {
      // Blocked storage: everything shows as new again next visit.
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  useEffect(() => {
    let current = true;
    const load = async () => {
      const result = await listActivity();
      if (current && result.ok) setAll(result.value);
    };
    void load();
    const visible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, REFRESH_MS);
    return () => {
      current = false;
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(timer);
    };
  }, []);

  // A first visit isn't greeted with a backlog: everything already there counts as read.
  useEffect(() => {
    if (seen === null && all.length) markSeen(all[0].at);
  }, [seen, all, markSeen]);

  const others = all.filter((item) => item.author.toLowerCase() !== name.toLowerCase());
  const isNew = (item: Activity) => seen !== null && item.at > seen;
  return {
    items: others,
    unread: others.filter(isNew).length,
    isNew,
    /** Everything shown so far is now read. */
    readAll: () => all.length && markSeen(all[0].at),
  };
}

export type ActivityFeed = ReturnType<typeof useActivity>;
