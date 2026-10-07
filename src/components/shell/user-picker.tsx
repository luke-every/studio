"use client";

import { useState, type FormEvent } from "react";

import { MotionModal } from "@/components/motion";
import { GUEST, useUser } from "@/lib/use-user";

import { UserIcon } from "./nav-icons";
import { UserAvatar } from "./user-avatar";

const face =
  "grid size-20 place-items-center rounded-[var(--r-full)] bg-surface-inset text-foreground-muted";

/**
 * Who's using the studio — a row of faces, like choosing a profile. It stands
 * over the home page until somebody is chosen; once someone is, the same
 * picker opens again from the user menu and can be dismissed.
 */
export function UserPicker({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { people, current, choose, add } = useUser();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const pick = (who: string) => {
    choose(who);
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    add(name);
    setAdding(false);
    setName("");
    onClose();
  };

  return (
    <MotionModal
      open={open}
      onClose={current === null ? () => {} : onClose}
      label="Who's using the studio?"
      className="max-w-[40rem] text-center"
    >
      <h2 className="text-lg font-medium text-foreground">
        Who&apos;s using the studio?
      </h2>

      <div className="mt-8 flex flex-wrap items-start justify-center gap-6">
        {people.map((who) => (
          <button
            key={who}
            type="button"
            onClick={() => pick(who)}
            className="group flex w-24 flex-col items-center gap-2"
          >
            <UserAvatar
              name={who}
              className={`size-20 transition-transform group-hover:scale-105 ${current === who ? "ring-2 ring-[var(--focus-ring)] ring-offset-2 ring-offset-surface-elevated" : ""}`}
              iconClassName="size-10"
            />
            <span className="max-w-full truncate text-sm text-foreground">
              {who}
            </span>
          </button>
        ))}

        {adding ? (
          <form
            onSubmit={submit}
            className="flex w-24 flex-col items-center gap-2"
          >
            <span className={face}>
              <UserIcon className="size-10" />
            </span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => !name.trim() && setAdding(false)}
              aria-label="Your name"
              placeholder="Your name"
              className="h-8 w-full rounded-[var(--r-md)] bg-surface-inset px-2 text-center text-sm text-foreground outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="group flex w-24 flex-col items-center gap-2"
          >
            <span
              className={`${face} text-xl transition-colors group-hover:bg-surface-hover group-hover:text-foreground`}
            >
              +
            </span>
            <span className="text-sm text-foreground-muted">Add new</span>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => pick(GUEST)}
        className="mt-8 h-10 rounded-[var(--r-full)] border border-border px-5 text-ui font-medium text-foreground hover:bg-surface-hover"
      >
        Continue as guest
      </button>
    </MotionModal>
  );
}
