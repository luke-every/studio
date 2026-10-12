"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import { avatarSrc, colorVar, type Profile } from "@/lib/avatars";
import type { Person } from "@/lib/registry/types";
import { useUser } from "@/lib/use-user";

import { UserIcon } from "./nav-icons";

/**
 * A person: their face, centred on their colour, in a circle. Pass `profile`
 * to show somebody being chosen; otherwise it is looked up by name. A guest
 * has no face, only a quiet fill.
 */
export function UserAvatar({
  name,
  profile,
  className = "size-8",
  tip = false,
}: {
  name: string;
  profile?: Profile;
  className?: string;
  /** Say who it is on hover, for where their name isn't written beside them. */
  tip?: boolean;
}) {
  const { profileOf } = useUser();

  if (!name && !profile) {
    return (
      <span aria-hidden className={`grid shrink-0 place-items-center rounded-[var(--r-full)] bg-surface-inset text-foreground-muted ${className}`}>
        <UserIcon className="size-1/2" />
      </span>
    );
  }

  const { avatar, color } = profile ?? profileOf(name);
  // The face fills the circle, kept in from the edge by the same share however big it is: 16px in a 124px circle.
  const circle = (
    <span
      aria-hidden
      style={{ background: colorVar(color) }}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-[var(--r-full)] ${className}`}
    >
      <Image src={avatarSrc(avatar)} alt="" width={256} height={256} sizes="128px" draggable={false} className="size-[74%] object-contain" />
    </span>
  );
  return tip ? <WithTip label={name}>{circle}</WithTip> : circle;
}

/** A small label under something, on hover. The same one the icon buttons use. */
function WithTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span role="img" aria-label={label} className="group/tip relative inline-flex shrink-0">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-[var(--r-md)] bg-accent px-2.5 py-1 text-xs font-normal text-accent-foreground opacity-0 transition-opacity duration-[var(--dur-instant)] ease-[var(--curve-entrance)] group-hover/tip:opacity-100"
        style={{ zIndex: "var(--z-popover)" }}
      >
        {label}
      </span>
    </span>
  );
}

const MOST = 3;

/**
 * People who worked on something, in a row that overlaps. Each face says who
 * it is on hover. Past a few the rest are counted, and that says who too.
 * `ring` is the colour of whatever it sits on, which cuts each face clear of
 * the next.
 */
export function AvatarStack({
  people,
  className = "size-10",
  overlap = "-ml-2",
  ring,
}: {
  people: Person[];
  className?: string;
  /** How far each face tucks under the one before. */
  overlap?: string;
  ring: "ring-background" | "ring-tile";
}) {
  const shown = people.length > MOST ? people.slice(0, MOST - 1) : people;
  const rest = people.slice(shown.length);
  const edge = `ring-2 ${ring}`;

  return (
    <span className="flex shrink-0 items-center">
      {shown.map((person, index) => (
        <span key={person.login} className={`flex ${index ? overlap : ""}`}>
          <UserAvatar name={person.name} tip className={`${className} ${edge}`} />
        </span>
      ))}
      {rest.length ? (
        <span className={`flex ${overlap}`}>
          <WithTip label={rest.map((person) => person.name).join(", ")}>
            <span aria-hidden className={`grid place-items-center rounded-[var(--r-full)] bg-surface-inset text-xs font-medium text-foreground-muted ${className} ${edge}`}>
              +{rest.length}
            </span>
          </WithTip>
        </span>
      ) : null}
    </span>
  );
}
