const KEY = "proto.fullscreen-hint";

/** Says how to get back from full screen, the first time in a session. */
export function hintFullscreen(notify: (message: string) => void) {
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Blocked storage: it is said each time, which is better than never.
  }
  notify("Press F to return");
}
