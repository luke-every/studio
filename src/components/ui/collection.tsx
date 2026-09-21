"use client";

import { MotionList } from "@/components/motion";
import type { ViewMode } from "@/lib/use-view-mode";
import type { ReactNode } from "react";

/**
 * The container both browsing surfaces share.
 *
 * Grid and list are two arrangements of one collection, so this is a single
 * layout-animated element whose class changes. The children keep their keys
 * and their layout ids, and Motion moves each one from where it was to where
 * it now belongs.
 */
export function Collection({ mode, children }: { mode: ViewMode; children: ReactNode }) {
  return (
    <MotionList
      className={
        mode === "grid"
          ? "grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "flex flex-col"
      }
    >
      {children}
    </MotionList>
  );
}
