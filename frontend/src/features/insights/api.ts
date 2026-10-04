import { apiClient } from "@/api/client";
import type { Explanation, Sensitivity, SnapshotDiff, SnapshotSummary } from "@/types/insights";

export async function listSnapshots(decisionId: string): Promise<SnapshotSummary[]> {
  const { data } = await apiClient.get<SnapshotSummary[]>(`/decisions/${decisionId}/snapshots`);
  return data;
}

export async function createSnapshot(decisionId: string, label: string): Promise<SnapshotSummary> {
  const { data } = await apiClient.post<SnapshotSummary>(`/decisions/${decisionId}/snapshots`, {
    label,
  });
  return data;
}

export async function compareSnapshots(
  decisionId: string,
  a: number,
  b: number | "current",
): Promise<SnapshotDiff> {
  const { data } = await apiClient.get<SnapshotDiff>(`/decisions/${decisionId}/snapshots/compare`, {
    params: { a, b },
  });
  return data;
}

export async function getSensitivity(decisionId: string): Promise<Sensitivity> {
  const { data } = await apiClient.get<Sensitivity>(`/decisions/${decisionId}/sensitivity`);
  return data;
}

export async function getExplanation(decisionId: string): Promise<Explanation> {
  const { data } = await apiClient.get<Explanation>(`/decisions/${decisionId}/explanation`);
  return data;
}
