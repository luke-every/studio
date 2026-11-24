"use client";

import { useEffect, useState } from "react";

import { MotionModal } from "@/components/motion";
import { UserAvatar } from "@/components/shell/user-avatar";
import { fieldClass } from "@/components/ui/dialog-form";
import { defaultProfile } from "@/lib/avatars";
import { useUser } from "@/lib/use-user";

type Found = { name: string; image?: string };

/**
 * Who is commenting, on a share link: found by searching, not by reading down a list of names. The link's review token is what lets the
 * search be asked (see /api/review/people), which gives six people at most and nothing for fewer than two letters.
 */
export function FindYourself({ open, onClose, onChosen, slug, version, token }: { open: boolean; onClose: () => void; onChosen: () => void; slug: string; /** The version's folder (v0-2), as the address has it. */ version: string; /** The link's review token. */ token: string }) {
  const { people, choose, add } = useUser();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const typed = query.trim();

  useEffect(() => {
    if (!open || typed.length < 2) return undefined;
    let current = true;
    const timer = window.setTimeout(() => {
      void fetch(`/api/review/people?${new URLSearchParams({ slug, version, token, q: typed })}`)
        .then((response) => (response.ok ? (response.json() as Promise<{ people: Found[] }>) : { people: [] }))
        .then((body) => current && setFound(body.people))
        .catch(() => current && setFound([]));
    }, 200);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [open, typed, slug, version, token]);

  const pick = (person: Found) => {
    const existing = people.find((one) => one.name.toLowerCase() === person.name.toLowerCase());
    if (existing) choose(existing.name);
    else add({ ...defaultProfile(person.name), image: person.image });
    onChosen();
  };

  return (
    <MotionModal open={open} onClose={onClose} label="Who's commenting?">
      <div className="flex flex-col gap-4">
        <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">Who&rsquo;s commenting?</h2>
        <input type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search for your name" placeholder="Search for your name" className={`${fieldClass} font-normal`} />
        {typed.length >= 2 && found.length ? (
          <ul className="flex flex-col">
            {found.map((person) => (
              <li key={person.name}>
                <button type="button" onClick={() => pick(person)} className="flex w-full items-center gap-2.5 rounded-[var(--r-control)] px-2.5 py-2 text-left text-nav hover:bg-surface-hover">
                  <UserAvatar name={person.name} profile={{ ...defaultProfile(person.name), image: person.image }} className="size-6" />
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </MotionModal>
  );
}
