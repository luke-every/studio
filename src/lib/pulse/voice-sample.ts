/**
 * The numbers here are sample, so the page can be judged before any data is
 * connected. The quotes are real, from the quiz usability test and Trustpilot,
 * and say where they came from. Replace with the week's snapshot.
 */
export type Mix = { positive: number; mixed: number; negative: number };

export type Quote = { text: string; source: string; market?: string };

export type Theme = {
  name: string;
  share: number;
  mix: Mix;
  trend: string;
  summary: string;
  quotes: Quote[];
};

export const voiceSample = {
  week: "26 Oct – 1 Nov",
  read: "Warm about the food. The friction is price against frozen, box size for a household, and pausing a subscription.",
  total: 186,
  against: "164 a week on average over the last four",
  mix: { positive: 52, mixed: 27, negative: 21 } satisfies Mix,
  shift: "Negative has crept from 16% to 21% over eight weeks.",
  weeks: [
    { label: "CW37", mix: { positive: 58, mixed: 26, negative: 16 } },
    { label: "CW38", mix: { positive: 57, mixed: 27, negative: 16 } },
    { label: "CW39", mix: { positive: 58, mixed: 25, negative: 17 } },
    { label: "CW40", mix: { positive: 56, mixed: 27, negative: 17 } },
    { label: "CW41", mix: { positive: 55, mixed: 27, negative: 18 } },
    { label: "CW42", mix: { positive: 55, mixed: 26, negative: 19 } },
    { label: "CW43", mix: { positive: 54, mixed: 26, negative: 20 } },
    { label: "CW44", mix: { positive: 52, mixed: 27, negative: 21 } },
  ] satisfies { label: string; mix: Mix }[],
  sources: [
    { label: "Product reviews", count: 94 },
    { label: "Support tickets", count: 41 },
    { label: "Survey answers", count: 33 },
    { label: "Social comments", count: 14 },
    { label: "Trustpilot", count: 4 },
  ],
  markets: [
    { label: "DE / AT", count: 112 },
    { label: "Benelux", count: 43 },
    { label: "CH", count: 31 },
  ],
  themes: [
    {
      name: "Price against frozen value",
      share: 31,
      mix: { positive: 18, mixed: 32, negative: 50 },
      trend: "Up 6 points",
      summary: "Judged against fresh food and groceries, not only the total.",
      quotes: [
        { text: "Expensive just for frozen stuff.", source: "Quiz test", market: "DE" },
        {
          text: "I'm not willing to pay too much. Even though to save time and to eat tasty, it's still challenging.",
          source: "Quiz test",
        },
      ],
    },
    {
      name: "Box size for a household",
      share: 24,
      mix: { positive: 20, mixed: 30, negative: 50 },
      trend: "Steady",
      summary: "Meals are sold in meals. People think in how many of us, and how many dinners.",
      quotes: [{ text: "Not really a family package when I choose family.", source: "Quiz test", market: "DE" }],
    },
    {
      name: "Pausing a subscription",
      share: 18,
      mix: { positive: 5, mixed: 20, negative: 75 },
      trend: "New this month",
      summary: "A paused subscription restarts, or billing carries on after a pause.",
      quotes: [{ text: "A convenient trap!", source: "Trustpilot, 2 stars" }],
    },
    {
      name: "Taste and appetite appeal",
      share: 15,
      mix: { positive: 78, mixed: 17, negative: 5 },
      trend: "Steady",
      summary: "The food builds appetite, and few doubt the frozen format.",
      quotes: [{ text: "Gives you literally the motivation to eat.", source: "Quiz test" }],
    },
    {
      name: "Delivery and carriers",
      share: 12,
      mix: { positive: 8, mixed: 25, negative: 67 },
      trend: "Down 2 points",
      summary: "Late or mishandled parcels, mostly named by carrier.",
      quotes: [],
    },
  ] satisfies Theme[],
};
