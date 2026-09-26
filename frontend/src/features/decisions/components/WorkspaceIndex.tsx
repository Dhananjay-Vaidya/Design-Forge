import { Navigate, useParams } from "react-router-dom";

import { Skeleton } from "@/components/States";

import { useReadiness } from "../hooks";

/** Opening a decision lands on the first stage that still needs work, else on the ranking. */
export function WorkspaceIndex() {
  const { decisionId = "" } = useParams();
  const readiness = useReadiness(decisionId);

  if (readiness.isLoading) return <Skeleton className="h-64 rounded-xl" />;

  const target = !readiness.hasAlternatives
    ? "alternatives"
    : !readiness.hasCriteria
      ? "criteria"
      : !readiness.isScored
        ? "scores"
        : "ranking";

  return <Navigate to={target} replace />;
}
