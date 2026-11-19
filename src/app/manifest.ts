import type { MetadataRoute } from "next";

/** Lets the studio be added to a phone's home screen, which is what lets iOS send it notifications. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Every Studio",
    short_name: "Every Studio",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/studio-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/studio-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
