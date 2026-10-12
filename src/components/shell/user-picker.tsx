"use client";

import { useState } from "react";

import { MotionModal } from "@/components/motion";
import { GUEST, useUser } from "@/lib/use-user";

import { NewUserModal } from "./profile-modal";
import { UserAvatar } from "./user-avatar";

/**
 * Who's using the studio — a row of faces, like choosing a profile. It stands
 * over the home page until somebody is chosen; once someone is, the same
 * picker opens again from the user menu and can be dismissed. Adding
 * somebody opens a modal of its own, and Cancel there comes back here.
 */
export function UserPicker({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { people, current, choose } = useUser();
  const [adding, setAdding] = useState(false);
  // Back from adding somebody: this modal takes over from that one, so the backdrop stays.
  const [returning, setReturning] = useState(false);

  const close = () => {
    setReturning(false);
    onClose();
  };

  const pick = (who: string) => {
    choose(who);
    close();
  };

  return (
    <>
      <MotionModal
        open={open && !adding}
        onClose={current === null ? () => {} : close}
        label="Who's using the studio?"
        className="max-w-[40rem] text-center"
        continuing={returning}
        successor={adding}
      >
        <h2 className="text-lg font-medium text-foreground">
          Who&apos;s using the studio?
        </h2>

        <div className="mt-8 flex flex-wrap items-start justify-center gap-6">
          {people.map((who) => (
            <button
              key={who.name}
              type="button"
              onClick={() => pick(who.name)}
              className="group flex w-24 flex-col items-center gap-2"
            >
              <UserAvatar
                name={who.name}
                profile={who}
                className="size-20 transition-transform group-hover:scale-105"
              />
              <span className="max-w-full truncate text-sm text-foreground">
                {who.name}
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="group flex w-24 flex-col items-center gap-2"
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
          className="mt-8 h-10 rounded-[var(--r-full)] border border-border px-5 text-ui font-medium text-foreground hover:bg-surface-hover"
        >
          Continue as guest
        </button>
      </MotionModal>

      <NewUserModal
        open={open && adding}
        successor={returning}
        onClose={() => {
          setAdding(false);
          setReturning(true);
        }}
        onCreated={() => {
          setAdding(false);
          close();
        }}
      />
    </>
  );
}
