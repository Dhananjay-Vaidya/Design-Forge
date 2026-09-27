import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { ApiError } from "@/api/client";
import type {
  AlternativeInput,
  CriterionInput,
  DecisionInput,
  DecisionStatus,
} from "@/types/decision";

import * as api from "./api";

export const decisionKeys = {
  all: ["decisions"] as const,
  list: () => ["decisions", "list"] as const,
  detail: (id: string) => ["decisions", id] as const,
  alternatives: (id: string) => ["decisions", id, "alternatives"] as const,
  criteria: (id: string) => ["decisions", id, "criteria"] as const,
  scores: (id: string) => ["decisions", id, "scores"] as const,
  ranking: (id: string) => ["decisions", id, "ranking"] as const,
};

/** Validation/not-found errors are deterministic — retrying them only delays the message. */
const retryTransientOnly = (failureCount: number, error: unknown) =>
  !(error instanceof ApiError && error.status !== undefined && error.status < 500) &&
  failureCount < 1;

export function useDecisions() {
  return useQuery({ queryKey: decisionKeys.list(), queryFn: api.listDecisions });
}

export function useDecision(id: string) {
  return useQuery({
    queryKey: decisionKeys.detail(id),
    queryFn: () => api.getDecision(id),
    retry: retryTransientOnly,
  });
}

export function useAlternatives(id: string) {
  return useQuery({
    queryKey: decisionKeys.alternatives(id),
    queryFn: () => api.listAlternatives(id),
  });
}

export function useCriteria(id: string) {
  return useQuery({ queryKey: decisionKeys.criteria(id), queryFn: () => api.listCriteria(id) });
}

export function useScores(id: string) {
  return useQuery({ queryKey: decisionKeys.scores(id), queryFn: () => api.getScores(id) });
}

export function useRanking(id: string, enabled = true) {
  return useQuery({
    queryKey: decisionKeys.ranking(id),
    queryFn: () => api.getRanking(id),
    retry: retryTransientOnly,
    enabled,
  });
}

/**
 * Any change to a decision's inputs can flip its status (DRAFT <-> SCORED) and its ranking,
 * so every mutation refreshes the whole decision subtree plus the dashboard list.
 */
function useInvalidateDecision(id: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: decisionKeys.detail(id) }),
      qc.invalidateQueries({ queryKey: decisionKeys.list() }),
    ]);
}

export function useUpdateDecision(id: string) {
  const invalidate = useInvalidateDecision(id);
  return useMutation({
    mutationFn: (body: Partial<DecisionInput> & { status?: DecisionStatus }) =>
      api.updateDecision(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteDecision(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteDecision(id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: decisionKeys.detail(id) });
      return qc.invalidateQueries({ queryKey: decisionKeys.list() });
    },
  });
}

export function useCreateAlternative(id: string) {
  const invalidate = useInvalidateDecision(id);
  return useMutation({
    mutationFn: (body: AlternativeInput) => api.createAlternative(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateAlternative(id: string) {
  const invalidate = useInvalidateDecision(id);
  return useMutation({
    mutationFn: ({ altId, body }: { altId: string; body: Partial<AlternativeInput> }) =>
      api.updateAlternative(altId, body),
    onSuccess: invalidate,
  });
}

/** Rewrites positions 0..n-1 in the given order, patching only rows that moved. */
export function useReorderAlternatives(id: string) {
  const invalidate = useInvalidateDecision(id);
  return useMutation({
    mutationFn: (ordered: { id: string; position: number }[]) =>
      Promise.all(
        ordered
          .map((alt, index) => ({ ...alt, index }))
          .filter((alt) => alt.position !== alt.index)
          .map((alt) => api.updateAlternative(alt.id, { position: alt.index })),
      ),
    onSettled: invalidate,
  });
}

export function useDeleteAlternative(id: string) {
  const invalidate = useInvalidateDecision(id);
  return useMutation({
    mutationFn: (altId: string) => api.deleteAlternative(altId),
    onSuccess: invalidate,
  });
}

export function useCreateCriterion(id: string) {
  const invalidate = useInvalidateDecision(id);
  return useMutation({
    mutationFn: (body: CriterionInput) => api.createCriterion(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateCriterion(id: string) {
  const invalidate = useInvalidateDecision(id);
  return useMutation({
    mutationFn: ({ critId, body }: { critId: string; body: Partial<CriterionInput> }) =>
      api.updateCriterion(critId, body),
    onSuccess: invalidate,
  });
}

export function useDeleteCriterion(id: string) {
  const invalidate = useInvalidateDecision(id);
  return useMutation({
    mutationFn: (critId: string) => api.deleteCriterion(critId),
    onSuccess: invalidate,
  });
}

export function useSaveScores(id: string) {
  const invalidate = useInvalidateDecision(id);
  return useMutation({
    mutationFn: (cells: Parameters<typeof api.putScores>[1]) => api.putScores(id, cells),
    onSuccess: invalidate,
  });
}

export interface Readiness {
  isLoading: boolean;
  alternatives: number;
  activeCriteria: number;
  filledCells: number;
  totalCells: number;
  hasAlternatives: boolean;
  hasCriteria: boolean;
  isScored: boolean;
  isReady: boolean;
}

/** docs/07 §2 — the workspace's progress indicator (BR-002/003/005). */
export function useReadiness(id: string): Readiness {
  const alternatives = useAlternatives(id);
  const criteria = useCriteria(id);
  const scores = useScores(id);

  return useMemo(() => {
    const alts = alternatives.data ?? [];
    const active = (criteria.data ?? []).filter((c) => c.is_active);
    const altIds = new Set(alts.map((a) => a.id));
    const critIds = new Set(active.map((c) => c.id));
    const filledCells = (scores.data ?? []).filter(
      (s) => altIds.has(s.alternative) && critIds.has(s.criterion),
    ).length;
    const totalCells = alts.length * active.length;
    const hasAlternatives = alts.length >= 2;
    const hasCriteria = active.length >= 1;
    const isScored = totalCells > 0 && filledCells >= totalCells;

    return {
      isLoading: alternatives.isLoading || criteria.isLoading || scores.isLoading,
      alternatives: alts.length,
      activeCriteria: active.length,
      filledCells,
      totalCells,
      hasAlternatives,
      hasCriteria,
      isScored,
      isReady: hasAlternatives && hasCriteria && isScored,
    };
  }, [
    alternatives.data,
    alternatives.isLoading,
    criteria.data,
    criteria.isLoading,
    scores.data,
    scores.isLoading,
  ]);
}
