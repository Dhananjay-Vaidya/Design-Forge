import { apiClient } from "@/api/client";
import type { Calibration, CommitInput, Commitment, OutcomeReview } from "@/types/commitment";

export async function commitDecision(decisionId: string, body: CommitInput): Promise<Commitment> {
  const { data } = await apiClient.post<Commitment>(`/decisions/${decisionId}/commit`, body);
  return data;
}

export async function listCommitments(decisionId: string): Promise<Commitment[]> {
  const { data } = await apiClient.get<Commitment[]>(`/decisions/${decisionId}/commitments`);
  return data;
}

export async function listOutcomes(decisionId: string): Promise<OutcomeReview[]> {
  const { data } = await apiClient.get<OutcomeReview[]>(`/decisions/${decisionId}/outcomes`);
  return data;
}

export async function createOutcome(
  decisionId: string,
  body: { due_at?: string; satisfaction?: number; result_notes?: string },
): Promise<OutcomeReview> {
  const { data } = await apiClient.post<OutcomeReview>(`/decisions/${decisionId}/outcomes`, body);
  return data;
}

export async function submitOutcome(
  outcomeId: string,
  body: { satisfaction: number; result_notes: string },
): Promise<OutcomeReview> {
  const { data } = await apiClient.post<OutcomeReview>(`/outcomes/${outcomeId}/submit`, body);
  return data;
}

export async function cancelOutcome(outcomeId: string): Promise<OutcomeReview> {
  const { data } = await apiClient.post<OutcomeReview>(`/outcomes/${outcomeId}/cancel`);
  return data;
}

export async function getCalibration(): Promise<Calibration> {
  const { data } = await apiClient.get<Calibration>("/dashboard/calibration");
  return data;
}
