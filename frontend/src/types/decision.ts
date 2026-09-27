/** Mirrors backend/app/schemas/decision.py. Decimal fields arrive as JSON strings. */

export type DecisionStatus =
  "DRAFT" | "SCORED" | "COMMITTED" | "UNDER_REVIEW" | "REVIEWED" | "ARCHIVED";

export type Direction = "benefit" | "cost";

export interface Decision {
  id: string;
  title: string;
  context: string;
  category: string;
  status: DecisionStatus;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface DecisionInput {
  title: string;
  context?: string;
  category?: string;
  deadline?: string | null;
}

export interface Alternative {
  id: string;
  decision: string;
  name: string;
  description: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface AlternativeInput {
  name: string;
  description?: string;
  position?: number;
}

export interface Criterion {
  id: string;
  decision: string;
  name: string;
  description: string;
  weight: string;
  direction: Direction;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CriterionInput {
  name: string;
  weight: number | string;
  direction: Direction;
  description?: string;
  is_active?: boolean;
  position?: number;
}

export interface ScoreCell {
  alternative: string;
  criterion: string;
  score: string;
  rationale: string;
  created_at: string;
  updated_at: string;
}

export interface ScoreCellInput {
  alternative_id: string;
  criterion_id: string;
  score: number;
  rationale: string;
}

export interface ScoreUpsertResponse {
  updated: number;
  missing_cells: { alternative_id: string; criterion_id: string }[];
}

export interface RankedAlternative {
  rank: number;
  alternative_id: string;
  name: string;
  total: string;
  breakdown: Record<string, string>;
}

export interface Ranking {
  decision_id: string;
  deterministic: boolean;
  computed_at: string;
  calculation_method: string;
  weights_normalized: Record<string, string>;
  ranking: RankedAlternative[];
  sensitivity: { leader_stable: boolean; note: string; margin: string };
}
