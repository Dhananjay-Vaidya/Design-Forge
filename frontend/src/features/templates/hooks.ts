import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { decisionKeys } from "@/features/decisions/hooks";

import * as api from "./api";

export const templateKeys = {
  all: ["templates"] as const,
  demo: ["demo"] as const,
};

export function useTemplates() {
  // The catalogue is static and personal templates change rarely; keep it warm between visits.
  return useQuery({
    queryKey: templateKeys.all,
    queryFn: api.listTemplates,
    staleTime: 5 * 60_000,
  });
}

export function useCreateFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createFromTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: decisionKeys.list() }),
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.saveTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all }),
  });
}

export function useDemoStatus() {
  return useQuery({ queryKey: templateKeys.demo, queryFn: api.getDemo, staleTime: 30_000 });
}

export function useCreateDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createDemo,
    onSuccess: async (decision) => {
      // Creating a sample deletes the previous one server-side. Refresh only the LIST and point the
      // sample marker at the new decision; invalidating every decision query would refetch the
      // deleted one (404) and replace the screen the user is about to leave.
      qc.setQueryData(templateKeys.demo, { decision_id: decision.id });
      await qc.invalidateQueries({ queryKey: decisionKeys.list() });
    },
  });
}
