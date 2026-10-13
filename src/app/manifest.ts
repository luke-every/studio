import type { MetadataRoute } from "next";

/** Lets the studio be added to a phone's home screen, which is what lets iOS send it notifications. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Test Kitchen",
    short_name: "Test Kitchen",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ff7a29",
    icons: [
      { src: "/icons/studio-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/studio-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
