import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { decisionKeys } from "@/features/decisions/hooks";
import type { CommitInput } from "@/types/commitment";

import * as api from "./api";

// Nested under ["decisions", id] so edits to the decision refresh them too.
export const commitmentKeys = {
  commitments: (id: string) => ["decisions", id, "commitments"] as const,
  outcomes: (id: string) => ["decisions", id, "outcomes"] as const,
  calibration: ["calibration"] as const,
};

export function useCommitments(id: string) {
  return useQuery({
    queryKey: commitmentKeys.commitments(id),
    queryFn: () => api.listCommitments(id),
  });
}

export function useOutcomes(id: string) {
  return useQuery({ queryKey: commitmentKeys.outcomes(id), queryFn: () => api.listOutcomes(id) });
}

export function useCalibration() {
  return useQuery({ queryKey: commitmentKeys.calibration, queryFn: api.getCalibration });
}

/** Commit/review changes can move the decision's status and the calibration, so refresh both. */
function useRefreshAfterChange(id: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: decisionKeys.detail(id) }),
      qc.invalidateQueries({ queryKey: decisionKeys.list() }),
      qc.invalidateQueries({ queryKey: commitmentKeys.calibration }),
    ]);
}

export function useCommit(id: string) {
  const refresh = useRefreshAfterChange(id);
  return useMutation({
    mutationFn: (body: CommitInput) => api.commitDecision(id, body),
    onSuccess: refresh,
  });
}

export function useCreateOutcome(id: string) {
  const refresh = useRefreshAfterChange(id);
  return useMutation({
    mutationFn: (body: { due_at?: string; satisfaction?: number; result_notes?: string }) =>
      api.createOutcome(id, body),
    onSuccess: refresh,
  });
}

export function useSubmitOutcome(id: string) {
  const refresh = useRefreshAfterChange(id);
  return useMutation({
    mutationFn: ({
      outcomeId,
      satisfaction,
      result_notes,
    }: {
      outcomeId: string;
      satisfaction: number;
      result_notes: string;
    }) => api.submitOutcome(outcomeId, { satisfaction, result_notes }),
    onSuccess: refresh,
  });
}

export function useCancelOutcome(id: string) {
  const refresh = useRefreshAfterChange(id);
  return useMutation({
    mutationFn: (outcomeId: string) => api.cancelOutcome(outcomeId),
    onSuccess: refresh,
  });
}
