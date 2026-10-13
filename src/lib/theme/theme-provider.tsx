"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { duration, easing } from "@/lib/motion";

import {
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "./constants";

type ThemeState = { preference: ThemePreference; resolved: ResolvedTheme };

type ThemeContextValue = ThemeState & {
  /**
   * Change the theme. `origin` is the point the change should appear to come
   * from — normally the element the user clicked — so the reveal has a cause.
   */
  setPreference: (next: ThemePreference, origin?: { x: number; y: number }) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/* ---------------------------------------------------------------------------
 * The theme lives on <html>, stamped by ThemeScript before first paint. React
 * reads it as an external store rather than mirroring it in state, so there is
 * never a frame where the DOM and React disagree about which theme is painted.
 * ------------------------------------------------------------------------- */

const SERVER_STATE: ThemeState = { preference: "system", resolved: "light" };
let snapshot: ThemeState = SERVER_STATE;
const listeners = new Set<() => void>();

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

function readFromDom(): ThemeState {
  const root = document.documentElement;
  const preference = (root.dataset.themePreference as ThemePreference | undefined) ?? "system";
  const resolved = (root.dataset.theme as ResolvedTheme | undefined) ?? resolve(preference);
  return { preference, resolved };
}

function publish(next: ThemeState) {
  if (next.preference === snapshot.preference && next.resolved === snapshot.resolved) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // First subscriber picks up whatever ThemeScript already wrote.
  publish(readFromDom());
  return () => {
    listeners.delete(listener);
  };
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Paints the new theme.
 *
 * Where the browser supports view transitions and the user has not asked for
 * reduced motion, the new theme is revealed as an expanding circle from the
 * point of interaction — the change has an origin and a direction rather than
 * every colour blinking at once. Everywhere else it falls back to the CSS
 * colour transition already declared on <body>.
 */
function applyTheme(state: ThemeState, origin?: { x: number; y: number }) {
  const root = document.documentElement;

  const paint = () => {
    root.dataset.theme = state.resolved;
    root.dataset.themePreference = state.preference;
    root.style.colorScheme = state.resolved;
  };

  const canReveal =
    typeof document.startViewTransition === "function" &&
    origin !== undefined &&
    !prefersReducedMotion();

  if (!canReveal) {
    paint();
    return;
  }

  const { x, y } = origin;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const transition = document.startViewTransition(paint);

  void transition.ready.then(() => {
    root.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
      },
      {
        duration: duration.deliberate * 1000,
        easing: `cubic-bezier(${easing.spatial.join(",")})`,
        pseudoElement: "::view-transition-new(root)",
      },
    );
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_STATE);

  // "system" means system: keep following the OS for as long as it is chosen.
  useEffect(() => {
    if (state.preference !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next: ThemeState = { preference: "system", resolved: systemTheme() };
      applyTheme(next);
      publish(next);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [state.preference]);

  const setPreference = useCallback(
    (preference: ThemePreference, origin?: { x: number; y: number }) => {
      const next: ThemeState = { preference, resolved: resolve(preference) };
      try {
        localStorage.setItem(THEME_STORAGE_KEY, preference);
      } catch {
        // Private browsing or blocked storage: the choice simply won't persist.
      }
      applyTheme(next, origin);
      publish(next);
    },
    [],
  );

  const value = useMemo(() => ({ ...state, setPreference }), [state, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
