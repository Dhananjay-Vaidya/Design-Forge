export interface Commitment {
  id: string;
  decision_id: string;
  alternative_id: string;
  alternative_name: string;
  confidence: number;
  rationale: string;
  is_active: boolean;
  snapshot_version: number;
  created_at: string;
}

export interface CommitInput {
  alternative_id: string;
  confidence: number;
  rationale: string;
}

export type OutcomeStatus = "SCHEDULED" | "DUE" | "SUBMITTED" | "CANCELLED";

export interface OutcomeReview {
  id: string;
  decision_id: string;
  commitment_id: string;
  due_at: string;
  status: OutcomeStatus;
  satisfaction: number | null;
  result_notes: string;
  submitted_at: string | null;
  created_at: string;
}

export type Verdict = "overconfident" | "underconfident" | "well_calibrated";

export interface CalibrationBucket {
  confidence_range: string;
  count: number;
  avg_confidence: number | null;
  success_rate: number | null;
  avg_satisfaction: number | null;
}

export interface CategoryCalibration {
  category: string;
  count: number;
  avg_confidence: number;
  success_rate: number;
  gap_points: number;
  verdict: Verdict | "not_enough_data";
}

export interface Calibration {
  deterministic: true;
  reviews_count: number;
  sufficient: boolean;
  min_reviews: number;
  success_threshold: number;
  avg_confidence: number | null;
  avg_satisfaction: number | null;
  success_rate: number | null;
  brier_score: number | null;
  brier_baseline: number | null;
  brier_skill: number | null;
  verdict: Verdict | null;
  buckets: CalibrationBucket[];
  categories: CategoryCalibration[];
  streaks: { current: number; best: number };
  note: string;
}
