"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { Anchor, Comment } from "@/lib/comments";
import { useUser } from "@/lib/use-user";
import { addComment, deleteComment, listComments, resolveComment, setCommentScreen } from "@/lib/registry/actions";

const SHOW_KEY = "proto.show-comments";
const showListeners = new Set<() => void>();

/** Whether pins are drawn. Per person, so it is browser state: on unless somebody turned it off. */
function readShown() {
  try {
    return localStorage.getItem(SHOW_KEY) !== "off";
  } catch {
    return true;
  }
}

export function useShowComments() {
  const shown = useSyncExternalStore(
    (listener) => {
      showListeners.add(listener);
      return () => void showListeners.delete(listener);
    },
    readShown,
    () => true,
  );
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(SHOW_KEY, next ? "on" : "off");
    } catch {
      // Blocked storage: it lasts until the page is left.
    }
    showListeners.forEach((listener) => listener());
  }, []);
  return [shown, set] as const;
}

/** Comments with a save in flight (deleting, resolving), wherever they are drawn: the save waits on the store, and what it is saving should show it. */
const working = new Set<string>();
const workingListeners = new Set<() => void>();
const setWorking = (id: string, on: boolean) => {
  if (on) working.add(id);
  else working.delete(id);
  workingListeners.forEach((listener) => listener());
};

export function useWorking(id: string) {
  return useSyncExternalStore(
    (listener) => {
      workingListeners.add(listener);
      return () => void workingListeners.delete(listener);
    },
    () => working.has(id),
    () => false,
  );
}

/**
 * The comments on one version. Read when it is opened and again whenever the
 * window is come back to, which is how somebody else's show up without a
 * refresh. A list grows, and comments get resolved or deleted.
 */
export function useComments(slug: string | undefined, version: string | undefined, by: string, variant?: string) {
  const { profileOf } = useUser();
  const avatar = by ? profileOf(by).avatar : undefined;
  const target = slug && version ? { slug, version } : undefined;
  const key = target ? `${slug}/${version}` : "";
  const [loaded, setLoaded] = useState<{ key: string; list: Comment[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || !version) return;
    let current = true;
    const read = () =>
      listComments(slug, version).then((result) => {
        if (!current) return;
        if (result.ok) setLoaded({ key, list: result.value });
        else setError(result.error);
      });
    void read();
    window.addEventListener("focus", read);
    return () => {
      current = false;
      window.removeEventListener("focus", read);
    };
  }, [slug, version, key]);

  const replace = (next: Comment) =>
    setLoaded((now) => (now && now.key === key ? { key, list: now.list.map((item) => (item.id === next.id ? next : item)) } : now));

  /**
   * Posts a comment; the comment, or null if it couldn't be saved. It is on the list at once, as a comment still being saved
   * (which breathes), and is swapped for the saved one when that lands or taken away again if it fails.
   */
  const add = async (text: string, anchor: Anchor, setup?: string) => {
    if (!target) return null;
    const pendingId = `pending-${crypto.randomUUID()}`;
    const setupOf = setup === undefined ? variant : setup || undefined;
    setLoaded((now) => {
      const list = now && now.key === key ? now.list : [];
      const n = Math.max(0, ...list.filter((item) => item.variant === setupOf).map((item) => item.n)) + 1;
      const pending: Comment = { id: pendingId, n, author: { login: "pending", name: by || "Someone" }, at: new Date().toISOString(), text: text.trim(), anchor, variant: setupOf };
      return { key, list: [...list, pending] };
    });
    setWorking(pendingId, true);
    const result = await addComment({ ...target, text, anchor, variant: setupOf, by, avatar }).finally(() => setWorking(pendingId, false));
    if (!result.ok) {
      setLoaded((now) => (now && now.key === key ? { key, list: now.list.filter((item) => item.id !== pendingId) } : now));
      setError(result.error);
      return null;
    }
    setError(null);
    // Swapped in place; if a refresh has dropped the pending one meanwhile, the saved comment is added unless it is already there.
    setLoaded((now) => {
      if (!now || now.key !== key) return now;
      if (now.list.some((item) => item.id === pendingId)) return { key, list: now.list.map((item) => (item.id === pendingId ? result.value : item)) };
      return now.list.some((item) => item.id === result.value.id) ? now : { key, list: [...now.list, result.value] };
    });
    return result.value;
  };

  /** Notes which flow screen a comment is on, so going to it next time needs no looking. */
  const place = async (comment: Comment, flowScreen: string) => {
    if (!target || comment.anchor.flowScreen === flowScreen) return;
    const result = await setCommentScreen({ ...target, id: comment.id, flowScreen });
    if (result.ok) replace(result.value);
  };

  const reply = async (parent: Comment, text: string) => {
    if (!target) return false;
    const result = await addComment({ ...target, text, parentId: parent.id, by, avatar });
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setError(null);
    setLoaded((now) => ({ key, list: [...(now && now.key === key ? now.list : []), result.value] }));
    return true;
  };

  /** Resolving or reopening shows at once, and is put back if it couldn't be saved. */
  const resolve = async (comment: Comment, resolved: boolean) => {
    if (!target) return;
    replace({ ...comment, resolvedAt: resolved ? new Date().toISOString() : undefined });
    const result = await resolveComment({ ...target, id: comment.id, resolved });
    if (result.ok) replace(result.value);
    else {
      replace(comment);
      setError(result.error);
    }
  };

  const remove = async (comment: Comment) => {
    if (!target) return;
    setWorking(comment.id, true);
    const result = await deleteComment({ ...target, id: comment.id }).finally(() => setWorking(comment.id, false));
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLoaded((now) =>
      now && now.key === key ? { key, list: now.list.filter((item) => item.id !== comment.id && item.parentId !== comment.id) } : now,
    );
  };

  // Comments are what has pins and rows; a reply belongs to the comment it answers.
  const every = loaded && loaded.key === key ? loaded.list : [];
  // Pins belong to the setup they were left on; the list of every comment on the version is not so particular.
  const all = every.filter((item) => item.variant === variant);
  const replies: Record<string, Comment[]> = {};
  for (const item of every) if (item.parentId) (replies[item.parentId] ??= []).push(item);

  return { comments: all.filter((item) => !item.parentId), everything: every.filter((item) => !item.parentId), replies, error, add, place, reply, resolve, remove };
}
