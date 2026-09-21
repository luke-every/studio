import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AppShell } from "@/components/shell/app-shell";
import { getSession, toViewer } from "@/lib/auth/session";
import { StudioProvider } from "@/lib/data/studio-store";
import { MotionProvider } from "@/lib/motion";
import { getRegistrySnapshot } from "@/lib/registry";
import { ViewerProvider } from "@/lib/viewer";
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
 * a snapshot. This is the only place the application touches the data source,
 * which is what keeps swapping that source a contained change.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const snapshot = await getRegistrySnapshot();
  const session = await getSession();

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <ViewerProvider viewer={session ? toViewer(session) : null}>
            <StudioProvider snapshot={snapshot}>
              <SearchProvider>
                <MotionProvider>
                  <AppShell>{children}</AppShell>
                </MotionProvider>
              </SearchProvider>
            </StudioProvider>
          </ViewerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
