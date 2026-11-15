/**
 * Real numbers from Mixpanel (every-foods.com), 26 Oct – 1 Nov, pulled by hand
 * on 6 Nov. People are counted once, each step within seven days of the first
 * page view, and returning customers are included. Replace with the week's
 * snapshot.
 */
export const behaviour = {
  week: "26 Oct – 1 Nov",
  read: "One in five visitors opens a product, and fewer than half of carts reach checkout.",
  funnel: [
    { label: "Visited the site", count: 43324 },
    { label: "Opened a product", count: 9025 },
    { label: "Added to cart", count: 2386 },
    { label: "Started checkout", count: 925 },
    { label: "Bought", count: 496 },
  ],
  subscriptions: [
    { label: "Rescheduled a delivery", now: 3823, before: 4643 },
    { label: "Paused", now: 291, before: 433 },
    { label: "Cancelled", now: 707, before: 1053 },
    { label: "Restarted", now: 164, before: 166 },
  ],
  notMeasured: [
    { label: "Bounce rate and engaged sessions", needs: "Triple Whale or Shopify" },
    { label: "Rage and dead clicks", needs: "Mixpanel autocapture switched on" },
    { label: "Page speed", needs: "A speed monitor" },
  ],
};
