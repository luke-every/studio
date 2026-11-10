"use client";

import { useEffect, useRef } from "react";

import { NotificationList } from "@/components/shell/notification-list";
import { useActivity } from "@/lib/use-activity";

/** The Notifications tab: the latest comments from the team. What was new is read once you leave, so it can still be seen while you are here. */
export default function NotificationsPage() {
  const feed = useActivity();

  const readAll = useRef(feed.readAll);
  useEffect(() => {
    readAll.current = feed.readAll;
  });
  useEffect(() => () => void readAll.current(), []);

  return (
    <div className="w-full px-5 pb-8 pt-2">
      <NotificationList feed={feed} onNavigate={feed.readAll} />
    </div>
  );
}
