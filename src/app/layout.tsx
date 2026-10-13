import type { Metadata, Viewport } from "next";

import { ThemeProvider, ThemeScript } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "Test Kitchen",
  description: "Explore what we're making.",
};

/** Tells the browser both schemes exist, so the blank page before the stylesheet arrives is dark for someone on dark, not white. */
export const viewport: Viewport = { colorScheme: "light dark" };

/**
 * The document, and nothing else.
 *
 * The studio itself lives in the (studio) group, so the door at /unlock can
 * render without the nav — and, more importantly, without the studio's
 * contents being fetched for someone who has not come in yet.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
