import type { Direction } from "./decision";

/** Mirrors backend/app/schemas/templates.py. Decimal weights arrive as JSON strings. */
export interface TemplateCriterion {
  name: string;
  description: string;
  weight: string;
  direction: Direction;
}

export interface Template {
  /** `builtin:<slug>` for the catalogue, a UUID for the caller's own templates. */
  id: string;
  kind: "builtin" | "mine";
  name: string;
  description: string;
  category: string;
  title_hint: string;
  criteria: TemplateCriterion[];
  option_hints: string[];
}

export interface DecisionFromTemplateInput {
  template_id: string;
  title: string;
  context?: string;
  category?: string | null;
  deadline?: string | null;
  options?: string[];
}
