/**
 * The phones a prototype can be previewed on.
 *
 * A prototype is built at phone size, so wherever it is shown it is laid out
 * at the chosen phone's own width and height and then scaled to fit the room
 * there is — never laid out at whatever narrower or wider width the window
 * happens to leave, which is what made it look different on different screens.
 * Sizes are CSS pixels (points), not screen pixels.
 */
export type Device = { id: string; name: string; width: number; height: number };

export const DEVICES: Device[] = [
  { id: "iphone-se", name: "iPhone SE", width: 375, height: 667 },
  { id: "iphone-13-mini", name: "iPhone 13 mini", width: 375, height: 812 },
  { id: "iphone-14", name: "iPhone 14", width: 390, height: 844 },
  { id: "iphone-15-pro", name: "iPhone 15 Pro", width: 393, height: 852 },
  { id: "iphone-16-pro", name: "iPhone 16 Pro", width: 402, height: 874 },
  { id: "iphone-15-pro-max", name: "iPhone 15 Pro Max", width: 430, height: 932 },
  { id: "iphone-16-pro-max", name: "iPhone 16 Pro Max", width: 440, height: 956 },
  { id: "pixel-8", name: "Pixel 8", width: 412, height: 915 },
  { id: "galaxy-s24-ultra", name: "Galaxy S24 Ultra", width: 384, height: 824 },
  { id: "galaxy-s23", name: "Galaxy S23", width: 360, height: 780 },
];

export const DEFAULT_DEVICE = DEVICES.find((device) => device.id === "iphone-14")!;

/** The size feed tiles and the saved pictures are made at. */
export const PHONE_WIDTH = DEFAULT_DEVICE.width;
export const PHONE_HEIGHT = DEFAULT_DEVICE.height;

/**
 * How big the preview is drawn, as a multiple of the phone's real size: at 100%
 * an iPhone 14 is 390 pixels wide on screen. "Fit" is separate, and shrinks or
 * grows the phone to the room there is instead.
 */
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const DEFAULT_ZOOM = 1;
