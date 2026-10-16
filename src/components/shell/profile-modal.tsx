"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";

import { MotionModal } from "@/components/motion";
import { IconButton } from "@/components/ui/button";
import { AVATAR_COLORS, AVATAR_COUNT, avatarSrc, colorVar, randomProfile, type Profile } from "@/lib/avatars";
import { useUser } from "@/lib/use-user";

/** How much room each face gets in the pager, in px. */
const SLOT = 144;
/** The circle the chosen face sits on, in px; the face fills it, 16px in from the edge. */
const CIRCLE = 124;
const FACE = CIRCLE - 32;
/** How faded a face is a whole slot away from the middle. */
const FADE = 0.6;

const clamp = (index: number) => Math.min(AVATAR_COUNT - 1, Math.max(0, index));

/**
 * The faces, in a row to drag through. The colour circle stays where it is, in
 * the middle; only the faces move, and the one over the circle is the chosen
 * one. The others wait, faded, on either side, and come into colour as they
 * arrive. Scroll, drag (with a mouse), click one, or use the arrow keys.
 */
function AvatarPager({ value, color, onChange }: { value: number; color: number; onChange: (index: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  // Where the row has got to, in faces and a fraction: it is what each face fades by as it passes the middle.
  const [position, setPosition] = useState(value);

  // It opens already on the chosen face.
  useLayoutEffect(() => {
    if (box.current) box.current.scrollLeft = value * SLOT;
    // Only on the way in: after that the scroll is what chooses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (index: number) => box.current?.scrollTo({ left: clamp(index) * SLOT, behavior: "smooth" });

  const release = () => {
    const element = box.current;
    const was = drag.current;
    if (!element || !was) return;
    if (was.moved) {
      // Snapping comes back, and settles on the nearest face.
      element.style.scrollSnapType = "";
      go(Math.round(element.scrollLeft / SLOT));
    }
    // After the click that ends the drag, which is not a choice.
    window.setTimeout(() => (drag.current = null), 0);
  };

  return (
    <div className="relative -mx-6">
      <span
        aria-hidden
        style={{ width: CIRCLE, height: CIRCLE, background: colorVar(color) }}
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-full)] transition-[background-color] duration-[var(--dur-fast)] ease-[var(--curve-standard)]"
      />
    <div
      ref={box}
      role="listbox"
      aria-label="Face"
      tabIndex={0}
      onScroll={(event) => {
        const at = event.currentTarget.scrollLeft / SLOT;
        setPosition(at);
        const index = clamp(Math.round(at));
        if (index !== value) onChange(index);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") go(value - 1);
        else if (event.key === "ArrowRight") go(value + 1);
        else return;
        event.preventDefault();
      }}
      // A mouse can't scroll sideways by dragging, so it is done here; touch does it itself.
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && box.current) drag.current = { x: event.clientX, left: box.current.scrollLeft, moved: false };
      }}
      onPointerMove={(event) => {
        const was = drag.current;
        const element = box.current;
        if (!was || !element) return;
        const dx = event.clientX - was.x;
        if (!was.moved) {
          if (Math.abs(dx) < 4) return;
          was.moved = true;
          element.setPointerCapture(event.pointerId);
          element.style.scrollSnapType = "none";
        }
        element.scrollLeft = was.left - dx;
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="relative flex cursor-grab snap-x snap-mandatory overflow-x-auto overscroll-x-contain py-2 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
    >
      {/* Room either side, so the first and last faces can reach the middle. */}
      <div aria-hidden className="shrink-0" style={{ width: `calc(50% - ${SLOT / 2}px)` }} />
      {Array.from({ length: AVATAR_COUNT }, (_, index) => {
        const away = Math.min(1, Math.abs(index - position));
        return (
          <button
            key={index}
            type="button"
            role="option"
            aria-selected={index === value}
            aria-label={`Face ${index + 1}`}
            tabIndex={-1}
            onClick={() => {
              if (!drag.current?.moved) go(index);
            }}
            style={{ width: SLOT, height: CIRCLE }}
            className="grid shrink-0 snap-center place-items-center"
          >
            <span style={{ width: FACE, height: FACE, opacity: 1 - FADE * away, filter: `grayscale(${away})` }} className="grid place-items-center">
              <Image src={avatarSrc(index)} alt="" width={256} height={256} sizes="128px" draggable={false} className="pointer-events-none size-full object-contain" />
            </span>
          </button>
        );
      })}
      <div aria-hidden className="shrink-0" style={{ width: `calc(50% - ${SLOT / 2}px)` }} />
    </div>
    </div>
  );
}

/** The colours a face can sit on, as small circles. */
function ColorChips({ value, onChange }: { value: number; onChange: (index: number) => void }) {
  return (
    <div role="group" aria-label="Colour" className="flex justify-center gap-3">
      {AVATAR_COLORS.map((name, index) => (
        <button
          key={name}
          type="button"
          aria-label={name}
          aria-pressed={index === value}
          onClick={() => onChange(index)}
          style={{ background: colorVar(index) }}
          className={`size-8 rounded-[var(--r-full)] transition-shadow duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${
            index === value ? "ring-2 ring-[var(--focus-ring)] ring-offset-2 ring-offset-surface-elevated" : ""
          }`}
        />
      ))}
    </div>
  );
}

function ProfileForm({
  title,
  submitLabel,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  initial: Profile;
  onSubmit: (profile: Profile) => string | null;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(onSubmit(profile));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <h2 className="text-lg font-medium text-foreground">{title}</h2>
      <AvatarPager value={profile.avatar} color={profile.color} onChange={(avatar) => setProfile((now) => ({ ...now, avatar }))} />
      <ColorChips value={profile.color} onChange={(color) => setProfile((now) => ({ ...now, color }))} />
      <div className="flex flex-col gap-2">
        <input
          value={profile.name}
          onChange={(event) => setProfile((now) => ({ ...now, name: event.target.value }))}
          maxLength={24}
          aria-label="Your name"
          placeholder="Your name"
          className="h-11 w-full bg-transparent px-3 text-center text-md text-foreground outline-none placeholder:text-foreground-subtle"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <div className="flex justify-center gap-2">
        <IconButton onClick={onClose}>Cancel</IconButton>
        <IconButton variant="primary" type="submit" disabled={!profile.name.trim()}>
          {submitLabel}
        </IconButton>
      </div>
    </form>
  );
}

/**
 * Choosing how somebody appears: a face from a row to drag through, a colour
 * to sit it on, and a name. Starts from `initial`, which is made fresh each time it opens.
 */
export function ProfileModal({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  onSubmit,
  focusName,
  continuing,
  successor,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial: () => Profile;
  /** Saves it, or says what is wrong. */
  onSubmit: (profile: Profile) => string | null;
  /** Start with the cursor in the name. */
  focusName?: boolean;
  /** Taking over from another modal: the backdrop stays. */
  continuing?: boolean;
  /** Handing over to another modal as it closes: the backdrop stays. */
  successor?: boolean;
}) {
  return (
    <MotionModal
      open={open}
      onClose={onClose}
      label={title}
      className="max-w-[40rem] text-center"
      focusSelector={focusName ? 'input[aria-label="Your name"]' : undefined}
      continuing={continuing}
      successor={successor}
    >
      <ProfileForm title={title} submitLabel={submitLabel} initial={initial()} onSubmit={onSubmit} onClose={onClose} />
    </MotionModal>
  );
}

/** Somebody new: a face and colour picked at random to start from. */
export function NewUserModal({ open, onClose, onCreated, successor, standalone, title = "Add somebody", submitLabel = "Add" }: { open: boolean; onClose: () => void; onCreated: () => void; successor?: boolean; /** Opened over a page, not taking over from the picker. */ standalone?: boolean; title?: string; submitLabel?: string }) {
  const { add } = useUser();
  return (
    <ProfileModal
      open={open}
      onClose={onClose}
      title={title}
      submitLabel={submitLabel}
      initial={() => randomProfile()}
      focusName
      // From the picker, which is closing as it opens; standalone, it brings its own backdrop.
      continuing={!standalone}
      successor={successor}
      onSubmit={(profile) => {
        const problem = add(profile);
        if (!problem) onCreated();
        return problem;
      }}
    />
  );
}

/** Changing how you appear: your face, colour and name. */
export function EditProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { current, profileOf, update } = useUser();
  return (
    <ProfileModal
      open={open && !!current}
      onClose={onClose}
      title="Your profile"
      submitLabel="Save"
      initial={() => profileOf(current ?? "")}
      onSubmit={(profile) => {
        const problem = update(current ?? "", profile);
        if (!problem) onClose();
        return problem;
      }}
    />
  );
}
