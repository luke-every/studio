"use client";

import { Toggle } from "@/components/ui/toggle";
import { themePreferences, useTheme, type ThemePreference } from "@/lib/theme";

import { MoonIcon, SunIcon, SystemIcon } from "./nav-icons";

const icons: Record<ThemePreference, React.ReactNode> = {
  light: <SunIcon />,
  dark: <MoonIcon />,
  system: <SystemIcon />,
};

/** Light, dark or the system's, chosen from the user menu. */
export function ThemeRow() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
      <span className="text-sm text-foreground">Theme</span>
      <Toggle
        label="Theme"
        value={preference}
        onChange={setPreference}
        options={themePreferences.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1), icon: icons[id] }))}
      />
    </div>
  );
}
