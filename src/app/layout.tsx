import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AppShell } from "@/components/shell/app-shell";
import { MotionProvider } from "@/lib/motion";
import { StudioProvider } from "@/lib/data/studio-store";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <StudioProvider>
            <SearchProvider>
              <MotionProvider>
                <AppShell>{children}</AppShell>
              </MotionProvider>
            </SearchProvider>
          </StudioProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
