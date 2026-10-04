import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { decisionKeys } from "@/features/decisions/hooks";

import { getAIStatus } from "../api";
import * as api from "./api";

// Shared with the Ask AI panel so the daily budget is read from one place.
export const aiStatusKey = ["ai", "status"] as const;
// Nested under ["decisions", id] so edits to the decision refresh these too.
export const proposalKeys = {
  list: (decisionId: string) => ["decisions", decisionId, "ai", "proposals"] as const,
};

export function useAiStatus() {
  return useQuery({ queryKey: aiStatusKey, queryFn: getAIStatus, staleTime: 30_000 });
}

export function useProposals(decisionId: string) {
  return useQuery({
    queryKey: proposalKeys.list(decisionId),
    queryFn: () => api.listProposals(decisionId),
  });
}

export function useRunAction(decisionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, input }: { action: string; input: Record<string, unknown> }) =>
      api.runAction(decisionId, action, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: proposalKeys.list(decisionId) }),
        qc.invalidateQueries({ queryKey: aiStatusKey }),
      ]),
    // A refused run (quota, provider down) changes the budget picture too.
    onError: () => qc.invalidateQueries({ queryKey: aiStatusKey }),
  });
}

/** Accepting writes ordinary options/criteria, so the whole decision subtree is refreshed. */
export function useAcceptProposal(decisionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId, itemIds }: { proposalId: string; itemIds: string[] }) =>
      api.acceptProposal(proposalId, itemIds),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: decisionKeys.detail(decisionId) }),
        qc.invalidateQueries({ queryKey: decisionKeys.list() }),
      ]),
  });
}

export function useRejectProposal(decisionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId, itemIds }: { proposalId: string; itemIds?: string[] }) =>
      api.rejectProposal(proposalId, itemIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: proposalKeys.list(decisionId) }),
  });
}
