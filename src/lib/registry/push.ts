import "server-only";

import { createECDH, createHmac } from "node:crypto";

import webpush, { type PushSubscription } from "web-push";

import { avatarSrc, AVATAR_COUNT, defaultProfile } from "@/lib/avatars";
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

/**
 * Tells people a comment was left: it goes on the bell's list, and every
 * device but the author's gets a push. Never throws: a comment is saved
 * whether or not anyone is told.
 */
export async function announceComment(input: { slug: string; version: string; comment: Comment; avatar?: number }) {
  try {
    const { comment } = input;
    const prototype = await getPrototype(input.slug);
    await recordActivity({
      id: comment.id,
      at: comment.at,
      author: comment.author.name,
      slug: input.slug,
      version: input.version,
      prototype: prototype?.name ?? input.slug,
      text: comment.text,
      reply: !!comment.parentId,
      comment: comment.parentId ?? comment.id,
    });

    const devices = await load();
    const targets = devices.filter((device) => device.name.toLowerCase() !== comment.author.name.toLowerCase());
    if (!targets.length) return;

    configure();

    // The face they chose if the commenter's device said which, else the one their name works out to.
    const chosen = input.avatar;
    const avatar = chosen !== undefined && Number.isInteger(chosen) && chosen >= 0 && chosen < AVATAR_COUNT ? chosen : defaultProfile(comment.author.name).avatar;
    const payload = JSON.stringify({
      title: `${comment.author.name} ${comment.parentId ? "replied" : "commented"} on ${prototype?.name ?? input.slug}`,
      body: comment.text,
      icon: avatarSrc(avatar),
      url: `/prototypes/${input.slug}?v=${input.version}&comment=${comment.parentId ?? comment.id}`,
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
    // Notifying is a courtesy; the comment is already saved.
    console.error("announcing a comment failed", error);
  }
}
