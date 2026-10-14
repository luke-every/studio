"use client";

import Link from "next/link";

import { Stamp } from "@/components/ui/stamp";
import type { Activity } from "@/lib/activity";
import type { ActivityFeed } from "@/lib/use-activity";

import { UserAvatar } from "./user-avatar";

/** The latest comments from the team, each opening the prototype it is on. */
export function NotificationList({ feed, onNavigate }: { feed: ActivityFeed; onNavigate: () => void }) {
  if (!feed.items.length) {
    return <p className="px-3 py-6 text-center text-sm text-foreground-muted">Nothing yet. Comments from your team show up here.</p>;
  }

  return (
    <ul className="flex max-h-[min(24rem,70dvh)] flex-col overflow-y-auto">
      {feed.items.map((item: Activity) => (
        <li key={item.id}>
          <Link
            href={`/prototypes/${item.slug}?v=${item.version}${item.comment ? `&comment=${item.comment}` : ""}`}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              // The prototype page reads the comment it is asked for when it loads, so this is a full load, like a tapped notification.
              event.preventDefault();
              onNavigate();
              window.location.assign(event.currentTarget.href);
            }}
            className="flex items-start gap-3 rounded-[var(--r-control)] px-2.5 py-2 hover:bg-surface-hover"
          >
            <UserAvatar name={item.author} className="size-8" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                <span className="font-medium">{item.author}</span> {item.like ? "liked your comment on" : item.reply ? "replied on" : "commented on"}{" "}
                <span className="font-medium">{item.prototype}</span>
              </p>
              <p className="line-clamp-2 text-sm text-foreground-muted">{item.text}</p>
              <p className="mt-0.5 text-xs text-foreground-subtle"><Stamp iso={item.at} relative /></p>
            </div>
            {feed.isNew(item) ? <span aria-label="New" className="mt-1.5 size-2 shrink-0 rounded-full bg-destructive" /> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
