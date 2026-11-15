/**
 * The devices a prototype can be previewed on.
 *
 * A prototype is built for one size of screen, so wherever it is shown it is
 * laid out at the chosen device's own width and height and then scaled to fit
 * the room there is — never laid out at whatever narrower or wider width the
 * window happens to leave, which is what made it look different on different
 * screens. Sizes are CSS pixels (points), not screen pixels. A few that matter
 * rather than every model: two phones, a tablet and a desktop.
 */
export type DeviceKind = "phone" | "tablet" | "desktop";
export type Device = { id: string; name: string; kind: DeviceKind; width: number; height: number; /** Has a home button: a short status bar and no home-indicator strip, so an app's bars are shorter. */ homeButton?: boolean };

export const DEVICES: Device[] = [
  { id: "iphone-se", name: "Small phone", kind: "phone", width: 375, height: 667, homeButton: true },
  { id: "iphone-14", name: "Large phone", kind: "phone", width: 390, height: 844 },
  { id: "tablet", name: "Tablet", kind: "tablet", width: 820, height: 1180 },
  { id: "desktop", name: "Desktop", kind: "desktop", width: 1440, height: 900 },
];

/**
 * The app a phone preview is opened inside, as a person arriving from an ad would see it: its bars take height from the
 * page, so the prototype is laid out in what is left. Sizes are in the bars' own drawing (`width`) and scale with the phone.
 */
export type InApp = { id: "none" | "instagram" | "safari"; name: string; /** The width the bars were drawn at. */ width: number; top: number; bottom: number };
export const IN_APPS: InApp[] = [
  { id: "none", name: "None", width: 420, top: 0, bottom: 0 },
  { id: "instagram", name: "Instagram", width: 420, top: 117, bottom: 89 },
  // Safari's bar floats at the foot of the screen (34 up, 48 tall); the page ends above it, so anything fixed to its bottom sits clear.
  { id: "safari", name: "Safari", width: 393, top: 60, bottom: 82 },
];

/** How much height an app's bars take on a device, in the bars' own drawing. */
export const barsOf = (app: InApp, device: Device, minimized = false) => {
  // Safari's bar shrinks to one small pill (28 tall, 18 up; 10 up with a home button) while the page is scrolled down.
  const safari = app.id === "safari" && minimized ? (device.homeButton ? 38 : 46) : null;
  if (!device.homeButton) return { top: app.top, bottom: safari ?? app.bottom };
  // No island or home indicator: the status bar is 20 instead of 60, and the strip under the buttons is gone.
  return app.id === "instagram" ? { top: app.top - 40, bottom: app.bottom - 34 } : { top: app.top - 40, bottom: safari ?? app.bottom - 24 };
};

export const DEFAULT_DEVICE = DEVICES.find((device) => device.id === "iphone-14")!;

/** The size feed tiles and the saved pictures are made at: a phone, whatever device a prototype is previewed on. */
export const PHONE_WIDTH = DEFAULT_DEVICE.width;
export const PHONE_HEIGHT = DEFAULT_DEVICE.height;

/**
 * How big the preview is drawn, as a multiple of the phone's real size: at 100%
 * a large phone is 390 pixels wide on screen. "Fit" is separate, and shrinks or
 * grows the device to the room there is instead.
 */
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const DEFAULT_ZOOM = 1;
