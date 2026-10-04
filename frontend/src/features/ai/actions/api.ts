import { apiClient } from "@/api/client";
import type { ActionInfo, Proposal, RunActionResponse } from "@/types/aiActions";

export async function listActions(): Promise<ActionInfo[]> {
  const { data } = await apiClient.get<ActionInfo[]>("/ai/actions");
  return data;
}

export async function runAction(
  decisionId: string,
  action: string,
  input: Record<string, unknown>,
): Promise<RunActionResponse> {
  // A model call can take a while; the server's own provider timeout is the limit that matters.
  const { data } = await apiClient.post<RunActionResponse>(
    `/decisions/${decisionId}/ai/${action}`,
    { input },
    { timeout: 60_000 },
  );
  return data;
}

export async function listProposals(decisionId: string): Promise<Proposal[]> {
  const { data } = await apiClient.get<Proposal[]>(`/decisions/${decisionId}/ai/proposals`);
  return data;
}

export async function acceptProposal(proposalId: string, itemIds: string[]): Promise<Proposal> {
  const { data } = await apiClient.post<Proposal>(`/ai/proposals/${proposalId}/accept`, {
    item_ids: itemIds,
  });
  return data;
}

export async function rejectProposal(proposalId: string, itemIds?: string[]): Promise<Proposal> {
  const { data } = await apiClient.post<Proposal>(`/ai/proposals/${proposalId}/reject`, {
    item_ids: itemIds ?? null,
  });
  return data;
}
