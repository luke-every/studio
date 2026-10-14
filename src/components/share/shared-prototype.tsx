"use client";

import { useState, type ReactNode } from "react";

import { MotionProvider, useOverlayBehaviour } from "@/lib/motion";
import { MotionScrim } from "@/components/motion";
import { ControlsPanel, VariantPicker } from "@/components/prototype/controls-panel";
import { useVersionVariants } from "@/components/prototype/use-version-variants";
import { usePrototypeControls } from "@/components/prototype/use-prototype-controls";
import { AvatarStack } from "@/components/shell/user-avatar";
import { barControl, IconButton } from "@/components/ui/button";
import { ScaledScreen } from "@/components/ui/scaled-screen";
import { Stamp } from "@/components/ui/stamp";
import { applyControls, defaultValues, type ControlValues } from "@/lib/controls";
import { VARIANT_PARAM } from "@/lib/edits";
import { DEFAULT_DEVICE } from "@/lib/phone";
import type { Person } from "@/lib/registry/types";
import { useMediaQuery } from "@/lib/use-media-query";

/**
 * A shared version, laid out like the prototype's own page without the studio
 * around it: the same side column (name, who and when, what it is, its
 * variants) beside the prototype on a phone. Nothing here can be changed.
 * Opened on a phone, it is the prototype itself filling the screen, with the
 * rest behind an About button.
 */
export function SharedPrototype(props: Parameters<typeof Shared>[0]) {
  return (
    <MotionProvider>
      <Shared {...props} />
    </MotionProvider>
  );
}

function Shared({
  name,
  description,
  people,
  updatedAt,
  version,
  review,
}: {
  name: string;
  description: string;
  people: Person[];
  updatedAt: string;
  version: { label: string; url: string };
  /** Added to the prototype's address, which is what lets a press and hold leave a comment. */
  review: string;
}) {
  const offered = usePrototypeControls(version.url);
  const variants = useVersionVariants(version.url);
  const [picked, setPicked] = useState<ControlValues>({});
  const [chosen, setChosen] = useState<string | null>(null);
  const values = { ...defaultValues(offered), ...picked };
  const variant = variants.find((item) => item.id === chosen)?.id ?? null;
  const controlled = applyControls(version.url, offered, values);
  const chosenAddress = variant ? `${controlled}${controlled.includes("?") ? "&" : "?"}${VARIANT_PARAM}=${variant}` : controlled;
  const address = `${chosenAddress}${chosenAddress.includes("?") ? "&" : "?"}review=${encodeURIComponent(review)}`;

  const phone = useMediaQuery("(max-width: 639px)");
  const [about, setAbout] = useState(false);

  const info = (
    <>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <h1 className="text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">{name}</h1>
            <p className="flex items-center gap-1.5 text-ui text-foreground-subtle">
              <AvatarStack people={people} className="size-5" overlap="-ml-1.5" ring="ring-tile" />
              <span className="text-foreground-muted">{people.length > 2 ? `${people[0].name} +${people.length - 1}` : people.map((person) => person.name).join(", ")}</span>
              <span aria-hidden>·</span>
              <span>
                Last updated <Stamp iso={updatedAt} relative />
              </span>
            </p>
          </div>
          <p className="text-base leading-[var(--leading-relaxed)] text-foreground-muted">{description}</p>
        </div>

        {offered || variants.length ? (
          <div className="flex flex-col gap-6 rounded-[var(--r-control)] border border-border p-4">
            {variants.length ? <VariantPicker variants={variants} value={variant} onChange={setChosen} /> : null}
            {offered ? <ControlsPanel controls={offered} values={values} onChange={(id, value) => setPicked((now) => ({ ...now, [id]: value }))} /> : null}
          </div>
        ) : null}
    </>
  );

  // On a phone the prototype is the page: its own screen, not a picture of one inside a page.
  if (phone) {
    return (
      <>
        <iframe src={address} title={`${name} ${version.label}`} className="block h-dvh w-full border-0 bg-surface" />
        <IconButton onClick={() => setAbout(true)} className="fixed right-3 top-3 z-[var(--z-raised)] shadow-floating">
          About
        </IconButton>
        <AboutSheet open={about} onClose={() => setAbout(false)} label={`About ${name}`}>
          <div className="flex flex-col gap-6">
            {info}
            <p className="text-ui text-foreground-subtle">Press and hold anywhere on the prototype to leave a comment.</p>
          </div>
        </AboutSheet>
      </>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 py-4 sm:px-8 lg:h-dvh lg:flex-row lg:gap-4 lg:p-4">
      <aside className="stagger-in flex min-w-0 flex-col gap-6 px-5 sm:px-0 lg:w-[var(--detail-side-width)] lg:shrink-0 lg:overflow-y-auto lg:rounded-[var(--r-tile)] lg:bg-tile lg:p-8">
        {info}
      </aside>

      <main className="stagger-in [--i:1] flex h-[var(--frame-height)] min-w-0 flex-1 flex-col bg-tile sm:rounded-[var(--r-tile)] lg:h-auto">
        <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-8 sm:py-8">
          <div className={barControl}>{version.label}</div>
          <p className="text-ui text-foreground-subtle max-sm:hidden">Press and hold on the prototype to leave a comment</p>
        </div>
        <div className="min-h-0 flex-1 px-4 pb-4 sm:pb-10">
          <ScaledScreen src={address} device={DEFAULT_DEVICE} title={`${name} ${version.label}`} />
        </div>
      </main>
    </div>
  );
}

/** The info for a phone: slides up from the bottom over the prototype, and back down when it is let go of. */
function AboutSheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const container = useOverlayBehaviour({ open, onClose });
  // Kept on screen while it slides back down.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!mounted) return null;
  return (
    <div className="fixed inset-0" style={{ zIndex: "var(--z-drawer)" }}>
      <MotionScrim onClick={onClose} leaving={!open} />
      <div
        ref={container}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onAnimationEnd={() => !open && setMounted(false)}
        className={`${open ? "sheet-up" : "sheet-down pointer-events-none"} absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[var(--r-xl)] border-t border-border bg-surface-elevated p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 shadow-[var(--elev-overlay)] outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
