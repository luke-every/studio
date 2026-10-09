"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import { Button, IconButton } from "@/components/ui/button";

import { SetupDialog } from "./setup-dialog";

const KEY = "proto.setup-dismissed";

/** Whether this person has already seen the prompt. Per browser, so it never nags twice. */
function useDismissed() {
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);

  const dismissed = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(KEY) === "1";
      } catch {
        return false;
      }
    },
    // On the server nothing is shown: it appears once the page is on screen.
    () => true,
  );

  const [justDismissed, setJustDismissed] = useState(false);
  const dismiss = () => {
    setJustDismissed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Blocked storage: it just comes back next time.
    }
  };

  return [dismissed || justDismissed, dismiss] as const;
}

/**
 * "New here? Get set up." A small card that comes up in the bottom right
 * corner, 40px in, a moment after the page. It opens the setup guide; the
 * same guide is under Setup in the user menu for anyone who closes this.
 */
export function SetupPrompt() {
  const [dismissed, dismiss] = useDismissed();
  const [open, setOpen] = useState(false);

  return (
    <>
      {dismissed ? null : (
        <aside
          aria-label="Get set up"
          className="layer-in fixed flex w-72 flex-col gap-3 rounded-[var(--r-xl)] border border-border bg-surface p-4 shadow-[var(--elev-floating)]"
          style={{
            bottom: "var(--space-xl)",
            right: "var(--space-xl)",
            zIndex: "var(--z-drawer)",
            transformOrigin: "bottom right",
            // A beat after the page, so it arrives rather than competes.
            animationDelay: "var(--dur-immersive)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-base font-medium text-foreground">New here?</p>
              <p className="mt-0.5 text-sm text-foreground-muted">Get set up to push your prototypes.</p>
            </div>
            <IconButton label="Close" variant="ghost" tooltipAlign="end" onClick={dismiss} className="-mr-2 -mt-2 !size-8">
              <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
                <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
              </svg>
            </IconButton>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setOpen(true);
              dismiss();
            }}
          >
            Get set up
          </Button>
        </aside>
      )}

      <SetupDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
