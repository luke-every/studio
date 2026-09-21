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
    teamSlug: "acquisition",
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
    teamSlug: "retention",
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
    teamSlug: "acquisition",
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
    teamSlug: "retention",
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
    teamSlug: "playground",
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

/**
 * Lighter fixtures. Enough shape to populate a project, without pretending to
 * a history that has not happened yet.
 */
function sketch(input: {
  slug: string;
  teamSlug: string;
  name: string;
  description: string;
  designQuestion: string;
  owner: Prototype["owner"];
  status: Prototype["status"];
  updatedAt: string;
  tags: string[];
  tint: [string, string];
  caption: string;
  context: string;
  exploration: { title: string; premise: string; version: string; summary: string; why: string };
  archived?: boolean;
}): Prototype {
  const preview = { tint: input.tint, caption: input.caption };

  return {
    slug: input.slug,
    teamSlug: input.teamSlug,
    name: input.name,
    description: input.description,
    designQuestion: input.designQuestion,
    owner: input.owner,
    collaborators: [],
    status: input.status,
    updatedAt: input.updatedAt,
    archived: input.archived ?? false,
    tags: input.tags,
    preview,
    currentExplorationId: "main",
    context: input.context,
    explorations: [
      {
        id: "main",
        title: input.exploration.title,
        premise: input.exploration.premise,
        author: input.owner,
        preview,
        versions: [
          {
            id: input.exploration.version,
            title: input.exploration.title,
            summary: input.exploration.summary,
            why: input.exploration.why,
            author: input.owner,
            date: input.updatedAt,
            preview,
          },
        ],
      },
    ],
  };
}

prototypes.push(
  sketch({
    slug: "quiz-question-pacing",
    teamSlug: "acquisition",
    name: "Question pacing",
    description: "How many questions we can ask before people start guessing to get to the end.",
    designQuestion: "Where is the line between thorough and tiring?",
    owner: people.mira,
    status: "exploring",
    updatedAt: "2026-09-19",
    tags: ["onboarding"],
    tint: ["#e8e6e1", "#8b8880"],
    caption: "Six questions, paced",
    context: "Drop-off climbs sharply after question seven, and the answers after it get noticeably less considered.",
    exploration: {
      title: "One question per screen",
      premise: "Give each question the whole screen and let progress do the reassuring.",
      version: "v0.3",
      summary: "One question at a time, with a quiet progress line rather than a counter.",
      why: "A counter invites bargaining. A line just shows movement.",
    },
  }),
  sketch({
    slug: "quiz-entry-point",
    teamSlug: "acquisition",
    name: "Entry point",
    description: "Where the quiz is offered, and what we promise before someone starts it.",
    designQuestion: "What makes starting feel worth the two minutes?",
    owner: people.luke,
    status: "in-review",
    updatedAt: "2026-09-14",
    tags: ["onboarding", "homepage"],
    tint: ["#e4e5e3", "#7f837e"],
    caption: "The invitation",
    context: "The current entry says 'Take the quiz'. It says nothing about what you get back.",
    exploration: {
      title: "Promise the outcome",
      premise: "Lead with what you end up with, not with what you have to do.",
      version: "v0.2",
      summary: "Entry copy names the result rather than the activity.",
      why: "People weigh effort against outcome. We were only ever showing them the effort.",
    },
  }),
  sketch({
    slug: "plan-change",
    teamSlug: "retention",
    name: "Changing a plan",
    description: "Moving up, down or sideways without talking to anyone.",
    designQuestion: "Can a plan change be reversible enough that nobody fears making it?",
    owner: people.tom,
    status: "exploring",
    updatedAt: "2026-09-10",
    tags: ["account"],
    tint: ["#e7e6e2", "#86837c"],
    caption: "Before and after",
    context: "Plan changes are the second most common support request after pauses.",
    exploration: {
      title: "Show the next delivery",
      premise: "Every plan change is really a question about the next box. Answer that first.",
      version: "v0.2",
      summary: "The next delivery is previewed as it will be after the change.",
      why: "Abstract plan names mean nothing. The box arriving on Thursday means everything.",
    },
  }),
  sketch({
    slug: "pdp-nutrition",
    teamSlug: "acquisition",
    name: "Nutrition at a glance",
    description: "The numbers people actually check, without the wall of a full panel.",
    designQuestion: "Which four numbers decide a purchase?",
    owner: people.sarah,
    status: "in-review",
    updatedAt: "2026-09-17",
    tags: ["pdp"],
    tint: ["#e9e8e3", "#8a8781"],
    caption: "Four numbers",
    context: "Session replays show people opening the nutrition tab, scanning, and closing it within four seconds.",
    exploration: {
      title: "Four up front",
      premise: "Surface the four most-checked numbers inline; keep the full panel one tap away.",
      version: "v0.4",
      summary: "Protein, fibre, sugar and calories shown inline under the price.",
      why: "Four seconds is not reading. It is looking for something specific.",
    },
  }),
  sketch({
    slug: "shelf-scanner",
    teamSlug: "playground",
    name: "Shelf scanner",
    description: "Point a phone at a shelf and get told what is worth eating.",
    designQuestion: "Is this a product, or just a good demo?",
    owner: people.mira,
    status: "exploring",
    updatedAt: "2026-09-20",
    tags: ["camera", "experiment"],
    tint: ["#dfe3e6", "#6d7a84"],
    caption: "Camera, live",
    context: "Built in a week to see whether the camera framing felt natural. It does. Everything after that is unresolved.",
    exploration: {
      title: "Hold and hover",
      premise: "No shutter button. Hold the phone up and results appear as you move.",
      version: "v0.2",
      summary: "Results resolve continuously instead of on a capture.",
      why: "A shutter turns browsing into a task. Hovering keeps it browsing.",
    },
  }),
  sketch({
    slug: "kitchen-timer",
    teamSlug: "playground",
    name: "Kitchen timer",
    description: "A timer that knows what you are cooking, because we sent it to you.",
    designQuestion: "Where does a brand stop being useful and start being present?",
    owner: people.tom,
    status: "exploring",
    updatedAt: "2026-09-13",
    tags: ["experiment"],
    tint: ["#e6e2dc", "#8b8177"],
    caption: "Twelve minutes",
    context: "An afternoon's work. Mostly here to argue about whether we should be in someone's kitchen at all.",
    exploration: {
      title: "One dish at a time",
      premise: "The timer only ever knows about the thing you are cooking right now.",
      version: "v0.1",
      summary: "A single timer tied to the current recipe, with no list and no history.",
      why: "The moment it becomes a timer app, we are competing with the phone's own. We are not going to win that.",
    },
  }),
  sketch({
    slug: "winback-note",
    teamSlug: "retention",
    name: "Win-back note",
    description: "What we say to someone who left three months ago.",
    designQuestion: "Is there a version of this that is not a discount?",
    owner: people.tom,
    status: "parked",
    updatedAt: "2026-07-22",
    tags: ["lifecycle", "email"],
    tint: ["#e6e5e1", "#8d8a84"],
    caption: "Three months later",
    context: "Parked while we work out whether we have anything to say that is not a percentage off.",
    exploration: {
      title: "Say what changed",
      premise: "Tell them what is different now. If nothing is, do not send anything.",
      version: "v0.1",
      summary: "The note leads with what has changed since they left.",
      why: "A discount says we want them back. Saying what changed gives them a reason to come.",
    },
  }),
);

export function getPrototype(slug: string): Prototype | undefined {
  return prototypes.find((prototype) => prototype.slug === slug);
}

export function getExploration(prototype: Prototype, explorationId?: string) {
  const id = explorationId ?? prototype.currentExplorationId;
  return prototype.explorations.find((exploration) => exploration.id === id);
}
