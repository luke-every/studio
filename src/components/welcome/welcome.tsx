"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type AnimationEvent, type FormEvent } from "react";

import { NewUserModal } from "@/components/shell/profile-modal";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { welcomeHold } from "@/lib/motion";
import { GUEST, useUser } from "@/lib/use-user";

/**
 * The welcome: the password, then who is here, then the studio.
 *
 * One continuous screen rather than pages. Each step arrives line by line,
 * top to bottom, and leaves all at once (`welcome-in` / `welcome-out`); a
 * chosen face is held selected for `welcomeHold` before the whole thing
 * leaves for the studio. Someone this browser already knows skips the
 * choosing.
 */
export function Welcome({ next }: { next: string }) {
  const router = useRouter();
  const { people, current, choose } = useUser();
  const [step, setStep] = useState<"password" | "who">("password");
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (picked === null) return undefined;
    const timer = window.setTimeout(() => setLeaving(true), welcomeHold * 1000);
    return () => window.clearTimeout(timer);
  }, [picked]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        setLeaving(true);
        return;
      }
      setProblem(response.status === 401 ? "Wrong password." : "Couldn't reach the studio. Try again.");
    } catch {
      setProblem("Couldn't reach the studio. Try again.");
    }
    setBusy(false);
  };

  const pick = (name: string) => {
    if (picked !== null) return;
    choose(name);
    setPicked(name);
  };

  // The step has finished leaving: on to the next, or into the studio.
  const left = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.animationName !== "welcome-out") return;
    if (step === "password" && current === null) {
      setStep("who");
      setLeaving(false);
      return;
    }
    router.replace(next);
  };

  return (
    <div className="grid min-h-dvh place-items-center overflow-hidden px-5">
      <div
        key={step}
        onAnimationEnd={left}
        className={`w-full ${step === "password" ? "max-w-[22rem]" : "max-w-[40rem] text-center"} ${leaving ? "welcome-out pointer-events-none" : ""}`}
      >
        {step === "password" ? (
          <>
            <p style={{ "--i": 0 } as React.CSSProperties} className="welcome-in text-center text-md font-medium tracking-[var(--tracking-tight)] text-foreground">
              Test Kitchen
            </p>

            <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
              <input
                name="password"
                type="password"
                autoFocus
                autoComplete="off"
                placeholder="Password"
                aria-label="Password"
                style={{ "--i": 1 } as React.CSSProperties}
                className="welcome-in w-full rounded-[var(--r-sm)] border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-border-strong focus:outline-none"
              />
              <Button type="submit" variant="primary" loading={busy} disabled={busy} style={{ "--i": 2 } as React.CSSProperties} className="welcome-in">
                Continue
              </Button>
            </form>

            {problem ? (
              <p role="alert" className="mt-3 text-center text-xs text-foreground-muted">
                {problem}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <h1 style={{ "--i": 0 } as React.CSSProperties} className="welcome-in text-lg font-medium text-foreground">
              Who&apos;s using the studio?
            </h1>

            <div className="mt-8 flex flex-wrap items-start justify-center gap-6">
              {people.map((who, index) => (
                <button
                  key={who.name}
                  type="button"
                  onClick={() => pick(who.name)}
                  style={{ "--i": index + 1 } as React.CSSProperties}
                  className={`welcome-in group flex w-24 flex-col items-center gap-3 transition-opacity duration-[var(--dur-standard)] ${picked !== null && picked !== who.name ? "opacity-30" : ""}`}
                >
                  <UserAvatar
                    name={who.name}
                    profile={who}
                    className={`size-20 outline-2 outline-offset-4 transition-[transform,outline-color] duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${
                      picked === who.name ? "scale-110 outline outline-foreground" : "outline outline-transparent group-hover:scale-105"
                    }`}
                  />
                  <span className="max-w-full truncate text-sm text-foreground">{who.name}</span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => setAdding(true)}
                disabled={picked !== null}
                style={{ "--i": people.length + 1 } as React.CSSProperties}
                className={`welcome-in group flex w-24 flex-col items-center gap-3 transition-opacity duration-[var(--dur-standard)] ${picked !== null ? "opacity-30" : ""}`}
              >
                <span className="grid size-20 place-items-center rounded-[var(--r-full)] bg-surface-inset text-xl text-foreground-muted transition-colors group-hover:bg-surface-hover group-hover:text-foreground">
                  +
                </span>
                <span className="text-sm text-foreground-muted">Add new</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => pick(GUEST)}
              style={{ "--i": people.length + 2 } as React.CSSProperties}
              className={`welcome-in mt-8 h-10 rounded-[var(--r-full)] border px-5 text-ui font-medium text-foreground transition-[opacity,background-color,border-color] duration-[var(--dur-standard)] hover:bg-surface-hover ${
                picked === GUEST ? "border-foreground" : "border-border"
              } ${picked !== null && picked !== GUEST ? "opacity-30" : ""}`}
            >
              Continue as guest
            </button>
          </>
        )}
      </div>

      <NewUserModal
        open={adding}
        standalone
        onClose={() => setAdding(false)}
        onCreated={() => {
          setAdding(false);
          setLeaving(true);
        }}
      />
    </div>
  );
}
