"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

const URL = "http://localhost:6006";

type State = "checking" | "off" | "starting" | "on";

/** Storybook framed in the studio; when it isn't running, a prompt to start it. */
export function StorybookPanel() {
  const [state, setState] = useState<State>("checking");
  const anchor = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);

  // Sit right under the bar, however tall it is (a phone has a second row for the tabs). The bottom is pinned to the
  // window itself, so no viewport-height arithmetic is involved, which a Safari web app gets wrong.
  useLayoutEffect(() => {
    const measure = () => anchor.current && setTop(anchor.current.getBoundingClientRect().top + window.scrollY);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Check once on opening, and keep checking while it starts.
  useEffect(() => {
    if (state !== "checking" && state !== "starting") return;
    let live = true;
    const check = async () => {
      const running = await fetch("/api/storybook")
        .then((res) => res.json())
        .then((body: { running: boolean }) => body.running)
        .catch(() => false);
      if (live) setState((now) => (running ? "on" : now === "checking" ? "off" : now));
    };
    void check();
    const timer = state === "starting" ? setInterval(check, 1500) : undefined;
    // Give up after a minute rather than loading forever.
    const giveUp = state === "starting" ? setTimeout(() => live && setState("off"), 60_000) : undefined;
    return () => {
      live = false;
      clearInterval(timer);
      clearTimeout(giveUp);
    };
  }, [state]);

  async function start() {
    setState("starting");
    await fetch("/api/storybook", { method: "POST" }).catch(() => setState("off"));
  }

  return (
    <>
      <div ref={anchor} />
      <div style={{ top }} className="fixed inset-x-0 bottom-0 bg-background">
        {state === "on" ? (
          <iframe src={URL} title="Storybook" className="block size-full border-0" />
        ) : state === "checking" ? null : (
          <Prompt starting={state === "starting"} onStart={start} />
        )}
      </div>
    </>
  );
}

function Prompt({ starting, onStart }: { starting: boolean; onStart: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 pb-16 text-center">
      <svg viewBox="0 0 204 100" aria-hidden className="w-52 text-foreground-subtle/20" fill="currentColor">
        <rect x="2" y="14" width="52" height="76" rx="10" transform="rotate(-12 28 52)" />
        <rect x="150" y="14" width="52" height="76" rx="10" transform="rotate(12 176 52)" />
        <rect x="52" y="0" width="100" height="100" rx="14" className="text-background" />
        <rect x="52" y="0" width="100" height="100" rx="14" />
        <circle cx="102" cy="34" r="9" className="text-background" />
        <rect x="86" y="54" width="32" height="4" rx="2" className="text-background" />
        <rect x="82" y="64" width="40" height="4" rx="2" className="text-background" />
      </svg>
      <div className="flex flex-col gap-2">
        <h1 className="text-md font-medium tracking-[var(--tracking-tight)]">Storybook isn&apos;t running</h1>
        <p className="max-w-[34ch] text-ui leading-[var(--leading-relaxed)] text-foreground-muted">
          Start it to browse the website&apos;s components here. It keeps running until you stop it.
        </p>
      </div>
      <Button variant="primary" loading={starting} disabled={starting} onClick={onStart}>
        {starting ? "Starting…" : "Start Storybook"}
      </Button>
    </div>
  );
}
