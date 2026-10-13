"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { Anchor, Comment } from "@/lib/comments";
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

/**
 * The comments on one version. Read when it is opened and again whenever the
 * window is come back to, which is how somebody else's show up without a
 * refresh. A list grows, and comments get resolved or deleted.
 */
export function useComments(slug: string | undefined, version: string | undefined, by: string, variant?: string) {
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

  /** Posts a comment; the comment, or null if it couldn't be saved. */
  const add = async (text: string, anchor: Anchor, setup?: string) => {
    if (!target) return null;
    const result = await addComment({ ...target, text, anchor, variant: setup === undefined ? variant : setup || undefined, by });
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setError(null);
    setLoaded((now) => ({ key, list: [...(now && now.key === key ? now.list : []), result.value] }));
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
    const result = await addComment({ ...target, text, parentId: parent.id, by });
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setError(null);
    setLoaded((now) => ({ key, list: [...(now && now.key === key ? now.list : []), result.value] }));
    return true;
  };

  const resolve = async (comment: Comment, resolved: boolean) => {
    if (!target) return;
    const result = await resolveComment({ ...target, id: comment.id, resolved });
    if (result.ok) replace(result.value);
    else setError(result.error);
  };

  const remove = async (comment: Comment) => {
    if (!target) return;
    const result = await deleteComment({ ...target, id: comment.id });
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
