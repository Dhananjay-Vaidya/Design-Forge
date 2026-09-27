import { z } from "zod";

/** Mirrors DecisionCreateRequest in backend/app/schemas/decision.py. */
export const decisionDetailsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the decision a title.")
    .max(200, "Keep the title under 200 characters."),
  context: z.string(),
  category: z.string().trim().max(64, "Keep the category under 64 characters."),
  deadline: z.string(),
});
export type DecisionDetailsValues = z.infer<typeof decisionDetailsSchema>;

export const CATEGORY_SUGGESTIONS = [
  "Career",
  "Business",
  "Finance",
  "Housing",
  "Education",
  "Health",
  "Purchase",
  "Personal",
];
