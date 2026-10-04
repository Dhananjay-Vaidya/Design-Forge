import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/client";

import * as api from "./api";

// Nested under ["decisions", id] so any edit to the decision refreshes these too.
export const insightKeys = {
  sensitivity: (id: string) => ["decisions", id, "sensitivity"] as const,
  explanation: (id: string) => ["decisions", id, "explanation"] as const,
  snapshots: (id: string) => ["decisions", id, "snapshots"] as const,
  compare: (id: string, a: number | null, b: number | "current" | null) =>
    ["decisions", id, "snapshots", "compare", a, b] as const,
};

const retryTransientOnly = (failureCount: number, error: unknown) =>
  !(error instanceof ApiError && error.status !== undefined && error.status < 500) &&
  failureCount < 1;

export function useSensitivity(id: string) {
  return useQuery({
    queryKey: insightKeys.sensitivity(id),
    queryFn: () => api.getSensitivity(id),
    retry: retryTransientOnly,
  });
}

export function useExplanation(id: string) {
  return useQuery({
    queryKey: insightKeys.explanation(id),
    queryFn: () => api.getExplanation(id),
    retry: retryTransientOnly,
  });
}

export function useSnapshots(id: string) {
  return useQuery({ queryKey: insightKeys.snapshots(id), queryFn: () => api.listSnapshots(id) });
}

export function useCreateSnapshot(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => api.createSnapshot(id, label),
    onSuccess: () => qc.invalidateQueries({ queryKey: insightKeys.snapshots(id) }),
  });
}

export function useCompare(id: string, a: number | null, b: number | "current" | null) {
  return useQuery({
    queryKey: insightKeys.compare(id, a, b),
    queryFn: () => api.compareSnapshots(id, a as number, b as number | "current"),
    enabled: a !== null && b !== null && a !== b,
    retry: retryTransientOnly,
  });
}
