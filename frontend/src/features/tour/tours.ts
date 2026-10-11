import type { TourId, TourStep } from "./types";

/**
 * Every tour, by id. Targets are `data-tour` ids on the real components; a step whose target is not
 * on the current screen is skipped, so a tour may list more stops than one route renders.
 */
export const tours: Record<TourId, TourStep[]> = {
  landing: [],

  /** Walks the ranking screen of the sample decision (FX-20). */
  workspace: [
    {
      target: "stage-tabs",
      title: "Four stages, one flow",
      body: "Options, Criteria, Scores, then Ranking. The badges show what is complete and what still needs work.",
      tone: "calc",
    },
    {
      target: "leader",
      title: "The calculated leader",
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
      target: "ask-ai",
      title: "Ask AI, as an advisor",
      body: "Optional questions, risks and counter-arguments. It is clearly marked advisory and can never change your ranking.",
      tone: "ai",
    },
  ],
};
