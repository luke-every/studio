import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AppShell } from "@/components/shell/app-shell";
import { StudioProvider } from "@/lib/data/studio-store";
import { isUnlocked } from "@/lib/gate";
import { MotionProvider } from "@/lib/motion";
import { getRegistrySnapshot } from "@/lib/registry";
import { SearchProvider } from "@/lib/search-store";
import { ThemeProvider, ThemeScript } from "@/lib/theme";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Prototype Studio",
  description: "Explore what we're making.",
};

/**
 * The registry is read once here, on the server, and handed to the client as
 * a snapshot. This is the only place the application touches the data source.
 *
 * Behind the door the studio is one shared space: nobody signs in, and
 * everyone sees the same thing.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const open = await isUnlocked();
  const snapshot = open
    ? await getRegistrySnapshot()
    : { people: [], teams: [], projects: [], prototypes: [] };

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          {open ? (
            <StudioProvider snapshot={snapshot}>
              <SearchProvider>
                <MotionProvider>
                  <AppShell>{children}</AppShell>
                </MotionProvider>
              </SearchProvider>
            </StudioProvider>
          ) : (
            children
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
