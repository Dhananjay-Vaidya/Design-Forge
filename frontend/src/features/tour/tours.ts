import type { TourId, TourStep } from "./types";

/**
 * Every tour, by id. Targets are `data-tour` ids on the real components; a step whose target is not
 * on the current screen is skipped, so a tour may list more stops than one route renders.
 */
export const tours: Record<TourId, TourStep[]> = {
  /** "Try the live demo" on the landing page: click-driven, never auto-started. */
  landing: [
    {
      target: "drafter",
      title: "Describe it",
      body: "Type the decision in plain words; AI drafts options and criteria for you to review. It never sets the scores.",
      tone: "ai",
    },
    {
      target: "ranking",
      title: "Score & rank",
      body: "Score each option against your criteria and get a transparent, reproducible weighted ranking.",
      tone: "calc",
    },
    {
      target: "ranking-why",
      title: "See the why",
      body: "Every ranking explains which criteria decided it and how close the race is.",
      tone: "calc",
    },
    {
      target: "sensitivity",
      title: "Stress-test it",
      body: "Drag the weights and watch the leader change, so you know how robust the choice is.",
      tone: "calc",
    },
    {
      target: "ai-advisory",
      title: "AI that advises",
      body: "Risks, assumptions and a devil's-advocate pass — drafts for your review that never touch the numbers.",
      tone: "ai",
    },
    {
      target: "templates",
      title: "Start from a template",
      body: "Pick a ready-made structure and adapt it in seconds.",
      tone: "calc",
    },
  ],

  /**
   * The decision workspace: the stage tabs, then the ranking screen, then AI help. Started from the
   * sample decision (FX-20) via "Take the tour", ?tour=1, or the dashboard's first-run nudge.
   */
  workspace: [
    {
      target: "tab-alternatives",
      title: "Options",
      body: "The alternatives you're choosing between. The badge counts them; you need at least two.",
      tone: "calc",
    },
    {
      target: "tab-criteria",
      title: "Criteria",
      body: "What matters and how much, and whether higher or lower is better for each.",
      tone: "calc",
    },
    {
      target: "tab-scores",
      title: "Scores",
      body: "Score every option 1–10 against every criterion. The badge shows how much of the matrix is filled.",
      tone: "calc",
    },
    {
      target: "leader",
      title: "Ranking: the calculated leader",
      body: "A weighted sum of your own scores. The same inputs always give the same answer, and no AI is involved.",
      tone: "calc",
    },
    {
      target: "stability",
      title: "Is the lead safe?",
      body: "This sample is a deliberate close call: a small change to a weight or score could flip the winner.",
      tone: "calc",
    },
    {
      target: "breakdown",
      title: "Why it ranks this way",
      body: "The points each criterion contributed to every option, so nothing is a black box.",
      tone: "calc",
    },
    {
      target: "tab-ai",
      title: "AI help",
      body: "Suggestions you accept or reject one by one. They are advisory and never change your scores or the ranking.",
      tone: "ai",
    },
    {
      target: "ask-ai",
      title: "Ask AI, as an advisor",
      body: "Optional questions, risks and counter-arguments. It is clearly marked advisory and can never change your ranking.",
      tone: "ai",
    },
  ],
};
