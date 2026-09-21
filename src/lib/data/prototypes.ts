import { people } from "./people";
import type { Prototype } from "./types";

/**
 * Fixtures.
 *
 * Stand-ins so the interface can be designed against real-shaped content.
 * They are intentionally written the way the team actually talks about work —
 * questions and reasoning, not tickets.
 */
export const prototypes: Prototype[] = [
  {
    slug: "quiz-results",
    name: "Quiz results",
    description:
      "What someone sees the moment the quiz finishes — and whether it feels like a recommendation or a receipt.",
    designQuestion:
      "Can the results page feel like advice from someone who knows food, rather than an algorithm's output?",
    owner: people.luke,
    collaborators: [people.sarah, people.mira],
    status: "in-review",
    updatedAt: "2026-09-18",
    archived: false,
    tags: ["onboarding", "recommendation"],
    preview: { tint: ["#f3d9c4", "#c4633d"], caption: "Results, editorial layout" },
    currentExplorationId: "editorial",
    context:
      "Two thirds of people who finish the quiz never scroll past the first recommendation. We assumed that was a content problem; the session replays suggest it is a hierarchy problem.",
    explorations: [
      {
        id: "editorial",
        title: "Editorial recommendation",
        premise:
          "Lead with one confident recommendation, written like a person wrote it, and let everything else be secondary.",
        author: people.luke,
        preview: { tint: ["#f3d9c4", "#c4633d"], caption: "One recommendation, in full" },
        versions: [
          {
            id: "v0.8",
            title: "Editorial recommendation hierarchy",
            summary:
              "The primary recommendation now owns the first screen; alternatives moved below the fold as a quiet row.",
            why: "People were comparing before they had understood the first suggestion. Removing the comparison from view forces the recommendation to stand on its own.",
            author: people.luke,
            date: "2026-09-18",
            preview: { tint: ["#f3d9c4", "#c4633d"], caption: "v0.8" },
          },
          {
            id: "v0.7",
            title: "Reasoning made visible",
            summary:
              "Added a short line under the recommendation explaining which answers led to it.",
            why: "Testers kept asking why they got what they got. Saying it out loud costs one line and buys a lot of trust.",
            author: people.mira,
            date: "2026-09-11",
            preview: { tint: ["#efd7cb", "#b2543d"], caption: "v0.7" },
          },
          {
            id: "v0.6",
            title: "Three cards, equal weight",
            summary: "The original layout: three recommendations shown side by side.",
            why: "The starting point we are arguing with. Equal weight turned out to mean no weight at all.",
            author: people.luke,
            date: "2026-09-02",
            preview: { tint: ["#e9dccd", "#8d8376"], caption: "v0.6" },
          },
        ],
      },
      {
        id: "comparison-first",
        title: "Comparison-first",
        premise:
          "Assume people want to choose, not be told. Put the comparison up front and make the differences legible.",
        author: people.sarah,
        preview: { tint: ["#dfe4d2", "#5f7a52"], caption: "Side-by-side comparison" },
        versions: [
          {
            id: "v0.3",
            title: "Difference-led comparison",
            summary:
              "Only the attributes that actually differ between the three results are shown.",
            why: "A full comparison table was unreadable. Showing sameness is wasted space; showing difference is the whole point.",
            author: people.sarah,
            date: "2026-09-15",
            preview: { tint: ["#dfe4d2", "#5f7a52"], caption: "v0.3" },
          },
          {
            id: "v0.2",
            title: "Full attribute table",
            summary: "Everything about every result, in a grid.",
            why: "Worth building to prove how much of it nobody reads.",
            author: people.sarah,
            date: "2026-09-08",
            preview: { tint: ["#e4e1d4", "#8d8376"], caption: "v0.2" },
          },
        ],
      },
    ],
  },
  {
    slug: "subscription-pause",
    name: "Pausing a subscription",
    description:
      "The moment someone wants to stop for a while. Making it easy without making it thoughtless.",
    designQuestion:
      "Can pausing feel generous rather than defensive, and still leave people likely to come back?",
    owner: people.sarah,
    collaborators: [people.tom],
    status: "exploring",
    updatedAt: "2026-09-16",
    archived: false,
    tags: ["retention", "account"],
    preview: { tint: ["#e6ddf0", "#7a6b96"], caption: "Pause, with a return date" },
    currentExplorationId: "return-date",
    context:
      "Support handles roughly forty pause requests a week by hand. Every one of them is a conversation we could have had in the product.",
    explorations: [
      {
        id: "return-date",
        title: "Pick a return date",
        premise:
          "A pause with a date attached is a plan. A pause without one is a slow cancellation.",
        author: people.sarah,
        preview: { tint: ["#e6ddf0", "#7a6b96"], caption: "Return date picker" },
        versions: [
          {
            id: "v0.4",
            title: "Suggested dates before the calendar",
            summary:
              "Three suggested return dates appear first; the full calendar is one tap further in.",
            why: "Most people pause for a holiday or a month. Suggesting the common answer is faster than asking them to find it.",
            author: people.sarah,
            date: "2026-09-16",
            preview: { tint: ["#e6ddf0", "#7a6b96"], caption: "v0.4" },
          },
          {
            id: "v0.3",
            title: "Calendar-first",
            summary: "Straight to a date picker.",
            why: "Honest and direct, but it asks for a decision before offering any help making it.",
            author: people.tom,
            date: "2026-09-09",
            preview: { tint: ["#e2dcea", "#8d8376"], caption: "v0.3" },
          },
        ],
      },
    ],
  },
  {
    slug: "ingredient-story",
    name: "Ingredient story",
    description:
      "Where a product came from, told on the product page without turning it into a brochure.",
    designQuestion:
      "How much origin story earns its place next to a buy button?",
    owner: people.mira,
    collaborators: [people.luke],
    status: "exploring",
    updatedAt: "2026-09-12",
    archived: false,
    tags: ["storytelling", "pdp"],
    preview: { tint: ["#e7e0cc", "#8a7c4e"], caption: "Origin, told in three beats" },
    currentExplorationId: "three-beats",
    context:
      "The brand team writes beautiful origin copy that nobody reads, because it lives at the bottom of the page behind a tab.",
    explorations: [
      {
        id: "three-beats",
        title: "Three beats",
        premise: "Grower, process, result. Three short moments, interleaved with the product imagery.",
        author: people.mira,
        preview: { tint: ["#e7e0cc", "#8a7c4e"], caption: "Three beats" },
        versions: [
          {
            id: "v0.2",
            title: "Interleaved with imagery",
            summary: "Story fragments sit between product photographs rather than after them.",
            why: "Scroll depth suggests people leave during the photography, not before it. Put the words where the eyes already are.",
            author: people.mira,
            date: "2026-09-12",
            preview: { tint: ["#e7e0cc", "#8a7c4e"], caption: "v0.2" },
          },
        ],
      },
    ],
  },
  {
    slug: "reorder-nudge",
    name: "Reorder nudge",
    description:
      "Noticing that someone is probably running low, and saying so without being creepy about it.",
    designQuestion: "What is the difference between helpful timing and surveillance?",
    owner: people.tom,
    collaborators: [],
    status: "shipped",
    updatedAt: "2026-08-29",
    archived: false,
    tags: ["lifecycle", "email"],
    preview: { tint: ["#dfe7e4", "#4f7a70"], caption: "Running low, probably" },
    currentExplorationId: "probably",
    context:
      "Shipped in August. Kept here because the tone work is the most useful part and we keep referring back to it.",
    explorations: [
      {
        id: "probably",
        title: "Say 'probably'",
        premise:
          "Admit the guess. The nudge is an estimate, and phrasing it as one makes it land better than certainty does.",
        author: people.tom,
        preview: { tint: ["#dfe7e4", "#4f7a70"], caption: "Probably" },
        versions: [
          {
            id: "v1.0",
            title: "Shipped wording",
            summary: "\"You're probably about a week out.\" Estimate stated as an estimate.",
            why: "Certainty about someone's kitchen reads as watching them. Uncertainty reads as thoughtfulness.",
            author: people.tom,
            date: "2026-08-29",
            preview: { tint: ["#dfe7e4", "#4f7a70"], caption: "v1.0" },
          },
        ],
      },
    ],
  },
  {
    slug: "gift-flow",
    name: "Gifting",
    description: "Buying for someone else, including the part where they find out.",
    designQuestion: "Who is the interface actually for — the buyer or the recipient?",
    owner: people.luke,
    collaborators: [people.mira],
    status: "parked",
    updatedAt: "2026-06-04",
    archived: true,
    tags: ["checkout", "seasonal"],
    preview: { tint: ["#f0dada", "#b2432f"], caption: "Two people, one purchase" },
    currentExplorationId: "recipient-first",
    context:
      "Parked until the autumn planning round. The recipient-first framing is the part worth picking back up.",
    explorations: [
      {
        id: "recipient-first",
        title: "Recipient-first",
        premise: "Design the arrival moment first and work backwards to the purchase.",
        author: people.luke,
        preview: { tint: ["#f0dada", "#b2432f"], caption: "The arrival moment" },
        versions: [
          {
            id: "v0.5",
            title: "Arrival before checkout",
            summary: "The buyer previews what the recipient will see before paying.",
            why: "The preview is the reassurance. Without it the buyer is trusting us with someone else's moment, blind.",
            author: people.luke,
            date: "2026-06-04",
            preview: { tint: ["#f0dada", "#b2432f"], caption: "v0.5" },
          },
        ],
      },
    ],
  },
];

export function getPrototype(slug: string): Prototype | undefined {
  return prototypes.find((prototype) => prototype.slug === slug);
}

export function getExploration(prototype: Prototype, explorationId?: string) {
  const id = explorationId ?? prototype.currentExplorationId;
  return prototype.explorations.find((exploration) => exploration.id === id);
}
