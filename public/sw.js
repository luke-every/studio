/*
 * Notifications. The studio sends a push when somebody leaves a comment; this
 * shows it, with the commenter's face, and opens the prototype when tapped.
 * It does nothing else: no caching, no offline.
 */
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "New comment", {
      body: data.body,
      icon: data.icon ? new URL(data.icon, self.location.origin).href : undefined,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("navigate" in client) return client.focus().then(() => client.navigate(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});
