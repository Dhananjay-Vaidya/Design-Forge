import { apiClient } from "@/api/client";
import type { Paginated } from "@/types/api";
import type {
  Alternative,
  AlternativeInput,
  Criterion,
  CriterionInput,
  Decision,
  DecisionInput,
  DecisionStatus,
  Ranking,
  ScoreCell,
  ScoreCellInput,
  ScoreUpsertResponse,
} from "@/types/decision";

/** The API caps page_size at 100 (backend/app/api/pagination.py). */
const ALL = { page_size: 100 };

export async function listDecisions(): Promise<Paginated<Decision>> {
  const { data } = await apiClient.get<Paginated<Decision>>("/decisions", { params: ALL });
  return data;
}

export async function getDecision(id: string): Promise<Decision> {
  const { data } = await apiClient.get<Decision>(`/decisions/${id}`);
  return data;
}

export async function createDecision(body: DecisionInput): Promise<Decision> {
  const { data } = await apiClient.post<Decision>("/decisions", body);
  return data;
}

export async function updateDecision(
  id: string,
  body: Partial<DecisionInput> & { status?: DecisionStatus },
): Promise<Decision> {
  const { data } = await apiClient.patch<Decision>(`/decisions/${id}`, body);
  return data;
}

export async function deleteDecision(id: string): Promise<void> {
  await apiClient.delete(`/decisions/${id}`);
}

export async function listAlternatives(decisionId: string): Promise<Alternative[]> {
  const { data } = await apiClient.get<Paginated<Alternative>>(
    `/decisions/${decisionId}/alternatives`,
    { params: ALL },
  );
  return data.results;
}

export async function createAlternative(decisionId: string, body: AlternativeInput): Promise<Alternative> {
  const { data } = await apiClient.post<Alternative>(`/decisions/${decisionId}/alternatives`, body);
  return data;
}

export async function updateAlternative(id: string, body: Partial<AlternativeInput>): Promise<Alternative> {
  const { data } = await apiClient.patch<Alternative>(`/alternatives/${id}`, body);
  return data;
}

export async function deleteAlternative(id: string): Promise<void> {
  await apiClient.delete(`/alternatives/${id}`);
}

export async function listCriteria(decisionId: string): Promise<Criterion[]> {
  const { data } = await apiClient.get<Paginated<Criterion>>(`/decisions/${decisionId}/criteria`, {
    params: ALL,
  });
  return data.results;
}

export async function createCriterion(decisionId: string, body: CriterionInput): Promise<Criterion> {
  const { data } = await apiClient.post<Criterion>(`/decisions/${decisionId}/criteria`, body);
  return data;
}

export async function updateCriterion(id: string, body: Partial<CriterionInput>): Promise<Criterion> {
  const { data } = await apiClient.patch<Criterion>(`/criteria/${id}`, body);
  return data;
}

export async function deleteCriterion(id: string): Promise<void> {
  await apiClient.delete(`/criteria/${id}`);
}

export async function getScores(decisionId: string): Promise<ScoreCell[]> {
  const { data } = await apiClient.get<ScoreCell[]>(`/decisions/${decisionId}/scores`);
  return data;
}

export async function putScores(decisionId: string, scores: ScoreCellInput[]): Promise<ScoreUpsertResponse> {
  const { data } = await apiClient.put<ScoreUpsertResponse>(`/decisions/${decisionId}/scores`, { scores });
  return data;
}

export async function getRanking(decisionId: string): Promise<Ranking> {
  const { data } = await apiClient.get<Ranking>(`/decisions/${decisionId}/ranking`);
  return data;
}
