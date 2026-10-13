import "server-only";

import { createECDH, createHmac } from "node:crypto";

import webpush, { type PushSubscription } from "web-push";

import { avatarSrc, AVATAR_COUNT, defaultProfile } from "@/lib/avatars";
import type { Activity } from "@/lib/activity";
import type { Comment } from "@/lib/comments";

import { recordActivity } from "./activity";
import { getPrototype } from "./index";
import { readStoreFile, writeStoreFile } from "./store";

/**
 * Push notifications: a phone's comment reaching the people who asked to hear.
 *
 * Devices that turned notifications on are listed in one file beside the
 * registry, with the name of whoever was using it. Nobody signs in, so that
 * name is only used to skip telling people about their own comments.
 *
 * Web Push needs a key pair. It is worked out from the studio password, the
 * way review links are signed, so there is nothing more to set up and
 * changing the password simply retires every device (they turn it on again).
 */

const PATH = "push/subscriptions.json";

type Device = { subscription: PushSubscription; name: string };

function keys() {
  const secret = process.env.STUDIO_PASSWORD?.trim() || "studio-open";
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(createHmac("sha256", secret).update("push:vapid").digest());
  return { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: ecdh.getPrivateKey().toString("base64url") };
}

/** What a browser needs to subscribe to this studio. */
export const pushPublicKey = () => keys().publicKey;

async function load(): Promise<Device[]> {
  const text = await readStoreFile(PATH);
  return text ? (JSON.parse(text) as Device[]) : [];
}

const save = (devices: Device[], message: string) => writeStoreFile(PATH, `${JSON.stringify(devices, null, 2)}\n`, message);

function validSubscription(value: unknown): value is PushSubscription {
  const sub = value as PushSubscription;
  return (
    typeof sub?.endpoint === "string" &&
    sub.endpoint.startsWith("https://") &&
    typeof sub.keys?.p256dh === "string" &&
    typeof sub.keys?.auth === "string"
  );
}

export async function addDevice(subscription: unknown, name: string) {
  if (!validSubscription(subscription)) throw new Error("That device can't be notified.");
  const devices = (await load()).filter((device) => device.subscription.endpoint !== subscription.endpoint);
  await save([...devices, { subscription, name: name.trim().slice(0, 40) }], "Add a device for notifications");
}

export async function removeDevice(endpoint: string) {
  const devices = await load();
  if (devices.some((device) => device.subscription.endpoint === endpoint)) {
    await save(devices.filter((device) => device.subscription.endpoint !== endpoint), "Remove a device from notifications");
  }
}

/** Readies web-push with this studio's keys. */
function configure() {
  const base = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  webpush.setVapidDetails(base ? `https://${base}` : "mailto:studio@localhost.invalid", keys().publicKey, keys().privateKey);
}

/** Sends one device a test, and says exactly what the push service answered if it refused. */
export async function sendTest(endpoint: string) {
  const device = (await load()).find((item) => item.subscription.endpoint === endpoint);
  if (!device) throw new Error("This device isn't registered. Switch notifications off and on again.");
  configure();
  try {
    await webpush.sendNotification(
      device.subscription,
      JSON.stringify({ title: "Test Kitchen", body: "Notifications are working.", icon: avatarSrc(defaultProfile(device.name || "Guest").avatar), url: "/" }),
    );
  } catch (error) {
    const failure = error as { statusCode?: number; body?: string };
    throw new Error(`The push service refused it (${failure.statusCode ?? "no answer"}): ${failure.body || "no reason given"}`);
  }
}

/** The face to show: the one the person's own device said they chose, else the one their name works out to. */
function faceOf(name: string, chosen?: number) {
  return avatarSrc(chosen !== undefined && Number.isInteger(chosen) && chosen >= 0 && chosen < AVATAR_COUNT ? chosen : defaultProfile(name).avatar);
}

/**
 * Puts something on the bell's list and pushes it to the devices that should hear: everyone's but `from`'s, or only
 * `to`'s when it is for one person. Never throws: what happened is saved whether or not anyone is told.
 */
async function announce(input: { activity: Activity; title: string; icon: string; to?: string }) {
  try {
    const { activity } = input;
    await recordActivity(activity);

    const devices = await load();
    const targets = devices.filter((device) => {
      const name = device.name.toLowerCase();
      return input.to ? name === input.to.toLowerCase() : name !== activity.author.toLowerCase();
    });
    if (!targets.length) return;

    configure();
    const payload = JSON.stringify({
      title: input.title,
      body: activity.text,
      icon: input.icon,
      url: `/prototypes/${activity.slug}?v=${activity.version}&comment=${activity.comment}`,
    });

    const gone: string[] = [];
    await Promise.all(
      targets.map((device) =>
        webpush.sendNotification(device.subscription, payload, { TTL: 60 * 60 * 24 }).catch((error: { statusCode?: number; body?: string }) => {
          if (error.statusCode === 404 || error.statusCode === 410) gone.push(device.subscription.endpoint);
          else console.error("push refused", error.statusCode, error.body);
        }),
      ),
    );
    if (gone.length) await save(devices.filter((device) => !gone.includes(device.subscription.endpoint)), "Drop devices that stopped listening");
  } catch (error) {
    console.error("announcing failed", error);
  }
}

/** A comment or reply was left: everyone but its author hears. */
export async function announceComment(input: { slug: string; version: string; comment: Comment; avatar?: number }) {
  const { comment } = input;
  const prototype = (await getPrototype(input.slug).catch(() => undefined))?.name ?? input.slug;
  await announce({
    activity: {
      id: comment.id,
      at: comment.at,
      author: comment.author.name,
      slug: input.slug,
      version: input.version,
      prototype,
      text: comment.text,
      reply: !!comment.parentId,
      comment: comment.parentId ?? comment.id,
    },
    title: `${comment.author.name} ${comment.parentId ? "replied" : "commented"} on ${prototype}`,
    icon: faceOf(comment.author.name, input.avatar),
  });
}

/** Somebody liked a comment: only the person who wrote it hears. */
export async function announceLike(input: { slug: string; version: string; comment: Comment; by: string; avatar?: number }) {
  const { comment, by } = input;
  const prototype = (await getPrototype(input.slug).catch(() => undefined))?.name ?? input.slug;
  await announce({
    activity: {
      // One entry per person and comment, so liking again moves it up rather than listing it twice.
      id: `like:${comment.id}:${by}`,
      at: new Date().toISOString(),
      author: by,
      slug: input.slug,
      version: input.version,
      prototype,
      text: comment.text,
      reply: false,
      like: true,
      to: comment.author.name,
      comment: comment.parentId ?? comment.id,
    },
    title: `${by} liked your ${comment.parentId ? "reply" : "comment"} on ${prototype}`,
    icon: faceOf(by, input.avatar),
    to: comment.author.name,
  });
}
