/*
 * Notifications. The studio sends a push when somebody leaves a comment; this
 * shows it, with the commenter's face, and opens the prototype when tapped.
 * It does nothing else: no caching, no offline.
 */
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    Promise.all([
    // Open pages refresh the bell now rather than at their next poll.
    self.clients.matchAll({ type: "window" }).then((windows) => windows.forEach((client) => client.postMessage({ refresh: true }))),
    self.registration.showNotification(data.title || "New comment", {
      body: data.body,
      icon: data.icon ? new URL(data.icon, self.location.origin).href : undefined,
      data: { url: data.url || "/" },
    }),
    ]),
  );
});

// Take over open pages right away, so a tab that was open when this was installed can be steered by a tap.
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        // A page this worker doesn't control refuses to be navigated; it is asked to go there itself instead.
        if ("navigate" in client) return client.focus().then(() => client.navigate(url)).catch(() => client.postMessage({ open: url }));
      }
      return self.clients.openWindow(url);
    }),
  );
});
