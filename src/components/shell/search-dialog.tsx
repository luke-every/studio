"use client";

import { useEffect } from "react";

import { MotionModal } from "@/components/motion";

import { SearchPanel } from "./search-panel";

/**
 * Search, floating over whatever page you are on. It opens with the cursor
 * already in the field; results are small versions of the feed's tiles and
 * appear as you type. Enter opens the first. "/" opens it from anywhere.
 */
export function SearchDialog({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
      event.preventDefault();
      onOpen();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpen]);

  return (
    <MotionModal open={open} onClose={onClose} label="Search" focusSelector="input" className="!max-w-[44rem] !p-4">
      {/* Mounted only while open, so the field starts empty each time. */}
      {open ? <SearchPanel onPick={onClose} listClassName="max-h-[60dvh] grid-cols-3 overflow-y-auto sm:grid-cols-4 [scrollbar-width:thin]" /> : null}
    </MotionModal>
  );
}
