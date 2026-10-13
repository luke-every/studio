"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { IconButton } from "@/components/ui/button";
import type { ActivityFeed } from "@/lib/use-activity";

import { BellIcon } from "./nav-icons";
import { NotificationList } from "./notification-list";

/** The count in red. Colour is a signal: this is the one place the nav uses it. */
export function UnreadBadge({ count, className = "" }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} unread`}
      className={`grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[length:var(--fs-2xs)] font-medium leading-none text-destructive-foreground ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** The bell: a red count of what is new, and the latest comments beneath it. Read once it is closed. */
export function NotificationsMenu({ feed }: { feed: ActivityFeed }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    feed.readAll();
  };

  return (
    <MotionPopover
      open={open}
      onClose={close}
      className="w-80"
      trigger={
        <IconButton
          label="Notifications"
          variant="ghost"
          tooltipAlign="end"
          tooltip={!open}
          onClick={() => (open ? close() : setOpen(true))}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <span className="relative">
            <BellIcon className="size-[1.125rem]" />
            <UnreadBadge count={feed.unread} className="absolute -right-2 -top-2" />
          </span>
        </IconButton>
      }
    >
      <div className="flex flex-col">
        <p className="px-2.5 pb-1.5 pt-2 text-sm font-medium text-foreground">Notifications</p>
        <NotificationList feed={feed} onNavigate={close} />
      </div>
    </MotionPopover>
  );
}
