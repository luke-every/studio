export const THEME_STORAGE_KEY = "proto.theme";

export const themePreferences = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof themePreferences)[number];

/** What is actually painted — "system" always resolves to one of these. */
export type ResolvedTheme = "light" | "dark";
