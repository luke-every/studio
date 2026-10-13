"use client";

import { useEffect, useState } from "react";

import { disablePush, enablePush, pushKey } from "@/lib/registry/actions";

import { useUser } from "./use-user";

/**
 * Whether this device hears about new comments.
 *
 * `unsupported` is a browser that can't (or an iPhone not yet added to the
 * home screen, where iOS only allows it from the installed app); `blocked`
 * is a permission refused in the browser's own settings, which only the
 * person can undo. `off` is the one state where asking makes sense.
 */
export type PushState = "checking" | "unsupported" | "blocked" | "off" | "on";

const CHANGED = "proto:push";

/**
 * A page can't ask again once the browser has been told no; only the person
 * can lift it, in the browser's own settings. Safari then only notices on a
 * reload, which is why the message ends with one.
 */
export function blockedMessage() {
  const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  return safari
    ? "Safari has notifications blocked for this site. In Safari, open Settings, then Websites, then Notifications, set this site to Allow, then reload and switch this on."
    : "Notifications are blocked for this site. Allow them from the lock icon beside the address (Site settings, then Notifications), then reload and switch this on.";
}

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  return registration?.pushManager.getSubscription() ?? null;
}

async function read(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const subscription = await currentSubscription().catch(() => null);
  return subscription && Notification.permission === "granted" ? "on" : "off";
}

export function usePush() {
  const { name } = useUser();
  const [state, setState] = useState<PushState>("checking");

  useEffect(() => {
    const refresh = () => void read().then(setState);
    refresh();
    window.addEventListener(CHANGED, refresh);
    // Allowing it in the browser's own settings happens away from this page; pick it up on return.
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  /** Asks the browser, then tells the studio. Returns what went wrong, or null. */
  const enable = async () => {
    try {
      if (Notification.permission === "denied") return blockedMessage();
      if ((await Notification.requestPermission()) !== "granted") return blockedMessage();
      const key = await pushKey();
      if (!key.ok) return key.error;
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key.value }));
      const saved = await enablePush(subscription.toJSON(), name);
      return saved.ok ? null : saved.error;
    } catch {
      return "This device couldn't turn notifications on.";
    } finally {
      window.dispatchEvent(new Event(CHANGED));
    }
  };

  const disable = async () => {
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await disablePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
    } finally {
      window.dispatchEvent(new Event(CHANGED));
    }
  };

  return { state, enable, disable };
}
