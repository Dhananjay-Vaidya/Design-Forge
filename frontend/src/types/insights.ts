export interface SnapshotSummary {
  id: string;
  version: number;
  reason: "manual" | "analysis" | "commitment";
  label: string;
  created_at: string;
  complete: boolean;
  leader: string | null;
  leader_points: number | null;
}

export interface SnapshotRef {
  version: number | null;
  label: string;
  created_at: string | null;
  is_current: boolean;
}

export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface CriterionChange {
  criterion_id: string;
  name: string;
  kind: "added" | "removed" | "changed";
  changes: FieldChange[];
  share_before: number | null;
  share_after: number | null;
}

export interface AlternativeChange {
  alternative_id: string;
  name: string;
  kind: "added" | "removed" | "renamed";
  before_name: string | null;
}

export interface ScoreChange {
  alternative_id: string;
  alternative: string;
  criterion_id: string;
  criterion: string;
  before: number;
  after: number;
}

export interface RankMove {
  alternative_id: string;
  name: string;
  rank_before: number | null;
  rank_after: number | null;
  points_before: number | null;
  points_after: number | null;
  points_delta: number | null;
  rank_delta: number | null;
}

export interface SnapshotDiff {
  a: SnapshotRef;
  b: SnapshotRef;
  summary: string[];
  decision_changes: FieldChange[];
  alternatives: AlternativeChange[];
  criteria: CriterionChange[];
  scores: ScoreChange[];
  score_cells_added: number;
  score_cells_removed: number;
  ranking: {
    available_before: boolean;
    available_after: boolean;
    leader_before: string | null;
    leader_after: string | null;
    leader_changed: boolean;
    moves: RankMove[];
  };
}

export interface LeaderRef {
  alternative_id: string;
  name: string;
  points: number;
}

export interface TornadoBar {
  criterion_id: string;
  name: string;
  share_percent: number;
  low_margin_points: number;
  high_margin_points: number;
  low_leader: string;
  high_leader: string;
  swing_points: number;
  flips: boolean;
}

export interface WeightFlip {
  criterion_id: string;
  name: string;
  challenger_id: string;
  challenger_name: string;
  direction: "increase" | "decrease";
  current_weight: number;
  flip_weight: number;
  current_share_percent: number;
  flip_share_percent: number;
  delta_points: number;
}

export interface ScoreFlip {
  alternative_id: string;
  alternative_name: string;
  criterion_id: string;
  criterion_name: string;
  role: "leader_down" | "challenger_up";
  current_score: number;
  flip_score: number;
  delta: number;
  feasible: boolean;
}

export interface Sensitivity {
  deterministic: true;
  leader: LeaderRef;
  runner_up: LeaderRef;
  margin_points: number;
  tornado: TornadoBar[];
  weight_flips: WeightFlip[];
  score_flips: ScoreFlip[];
  tornado_low_factor: number;
  tornado_high_factor: number;
}

export interface Explanation {
  deterministic: true;
  headline: string;
  drivers: { criterion: string; share_percent: number; points: number }[];
  ahead_on: { criterion: string; points: number }[];
  behind_on: { criterion: string; points: number }[];
  stability: string;
  flip_hint: string;
  text: string;
}
