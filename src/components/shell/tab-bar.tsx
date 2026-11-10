"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import { useUser } from "@/lib/use-user";

import { BellIcon, HomeIcon, LiveIcon, SearchIcon } from "./nav-icons";
import { UnreadBadge } from "./notifications-menu";
import { UserAvatar } from "./user-avatar";

/** Local only: the tab is not built into the live studio, which has no dev servers to show. */
export const SHOW_LIVE = process.env.NODE_ENV === "development";

const tab = "relative z-10 flex flex-1 flex-col items-center justify-center gap-1 rounded-[var(--r-full)] text-[length:var(--fs-2xs)] font-medium";

function Tab({ label, href, active, icon }: { label: string; href: string; active: boolean; icon: ReactNode }) {
  return (
    <Link href={href} className={`${tab} ${active ? "text-foreground" : "text-foreground-muted"}`} aria-current={active ? "page" : undefined}>
      {icon}
      {label}
    </Link>
  );
}

/**
 * The phone's way around: Home, Live (on this machine only), Search, Notifications and Me, each a page of its own. Plain links, with the current tab worked
 * out from the path, so it needs nothing from the server and is on screen before anything else is. A floating pill, inset from the edges, with a pill under the current tab that slides to the one you tap. Gone on a
 * prototype's own page, which wants the whole screen.
 */
export function TabBar({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  const { name } = useUser();
  if (pathname.startsWith("/prototypes/")) return null;
  const tabs = SHOW_LIVE ? ["home", "live", "search", "notifications", "me"] : ["home", "search", "notifications", "me"];
  const current = ["live", "search", "notifications", "me"].find((tab) => pathname === `/${tab}` && tabs.includes(tab)) ?? "home";

  return (
    <>
      {/* Holds the bar's place in the page, so the last of the content isn't under it. */}
      <div aria-hidden className="h-[calc(var(--tab-height)+var(--tab-bottom)+var(--tab-inset))] sm:hidden" />
      <nav aria-label="Tabs" className="fixed inset-x-[var(--tab-side)] bottom-[var(--tab-bottom)] z-[var(--z-sticky)] rounded-[var(--r-full)] border border-border bg-surface-elevated p-[var(--tab-pad)] shadow-[var(--elev-floating)] sm:hidden">
        <div
          className="relative flex h-[calc(var(--tab-height)-var(--tab-pad)*2)]"
          style={{ "--tabs": tabs.length, "--tab-index": tabs.indexOf(current) } as CSSProperties}
        >
          <span aria-hidden className="tab-slide absolute inset-y-0 left-0 rounded-[var(--r-full)] bg-surface-inset" />
          <Tab label="Home" href="/" active={current === "home"} icon={<HomeIcon className="size-5" />} />
          {SHOW_LIVE ? <Tab label="Live" href="/live" active={current === "live"} icon={<LiveIcon className="size-5" />} /> : null}
          <Tab label="Search" href="/search" active={current === "search"} icon={<SearchIcon className="size-5" />} />
          <Tab
            label="Notifications"
            href="/notifications"
            active={current === "notifications"}
            icon={
              <span className="relative">
                <BellIcon className="size-5" />
                <UnreadBadge count={unread} className="absolute -right-2.5 -top-1.5" />
              </span>
            }
          />
          <Tab label="Me" href="/me" active={current === "me"} icon={<UserAvatar name={name} className="size-5" />} />
        </div>
      </nav>
    </>
  );
}
