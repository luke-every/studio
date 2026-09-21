"use client";

import Link from "next/link";
import Image from "next/image";

import { useViewer } from "@/lib/viewer";

/**
 * Who you are, in the corner of the nav.
 *
 * Signed out, it is the way in. Signed in, it is a quiet confirmation that
 * anything you create will carry your name — which is the point of the
 * studio existing rather than links being passed around.
 */
export function ViewerBadge() {
  const viewer = useViewer();

  if (!viewer) {
    return (
      <Link
        href="/api/auth/signin"
        className="flex items-center gap-1.5 rounded-[var(--r-sm)] px-1.5 py-1 text-xs text-foreground-muted hover:bg-surface-hover hover:text-foreground"
      >
        <GitHubMark />
        Sign in
      </Link>
    );
  }

  return (
    <Link
      href="/settings"
      className="flex min-w-0 items-center gap-2 rounded-[var(--r-sm)] px-1 py-1 text-xs text-foreground-muted hover:bg-surface-hover hover:text-foreground"
    >
      {viewer.avatarUrl ? (
        <Image
          src={viewer.avatarUrl}
          alt=""
          width={20}
          height={20}
          className="size-5 shrink-0 rounded-full"
          unoptimized
        />
      ) : null}
      <span className="truncate">{viewer.name}</span>
    </Link>
  );
}

export function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0" fill="currentColor">
      <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2 .4-2.5-.5-2.7-1 0-.1-.5-.9-.9-1.1-.3-.2-.8-.6 0-.6.6 0 1 .6 1.2.9.7 1.2 1.9.9 2.4.7 0-.6.3-.9.5-1.1-1.8-.2-3.7-.9-3.7-4 0-.9.3-1.6.8-2.2 0-.2-.3-1 .1-2.1 0 0 .7-.2 2.2.8a7.4 7.4 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.2 0 3.1-1.9 3.8-3.7 4 .3.3.6.8.6 1.6v2.2c0 .2.1.5.5.4A8 8 0 0 0 8 .2Z" />
    </svg>
  );
}
