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
export type Device = { id: string; name: string; kind: DeviceKind; width: number; height: number };

export const DEVICES: Device[] = [
  { id: "iphone-se", name: "Small phone", kind: "phone", width: 375, height: 667 },
  { id: "iphone-14", name: "Large phone", kind: "phone", width: 390, height: 844 },
  { id: "tablet", name: "Tablet", kind: "tablet", width: 820, height: 1180 },
  { id: "desktop", name: "Desktop", kind: "desktop", width: 1440, height: 900 },
];

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
