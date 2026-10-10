import { apiClient } from "@/api/client";
import type { Decision } from "@/types/decision";

import type { Scaffold } from "./draftStore";

export interface GuideStatus {
  enabled: boolean;
  free_drafts_per_day: number;
  drafts_remaining: number;
}

export interface DraftResponse {
  status: "ok" | "capped" | "refused" | "degraded";
  scaffold: Scaffold | null;
  draft_token: string | null;
  drafts_remaining: number | null;
  message: string | null;
  from_cache: boolean;
}

export async function getGuideStatus(): Promise<GuideStatus> {
  const { data } = await apiClient.get<GuideStatus>("/guide/status");
  return data;
}

export async function draftDecision(description: string): Promise<DraftResponse> {
  const { data } = await apiClient.post<DraftResponse>(
    "/guide/draft-decision",
    { description },
    { timeout: 60_000 },
  );
  return data;
}

/** Signed in only: turn a home-page draft into a real decision (no scores, equal weights). */
export async function saveScaffold(scaffold: Scaffold, draftToken: string): Promise<Decision> {
  const { data } = await apiClient.post<Decision>("/decisions/from-scaffold", {
    scaffold,
    draft_token: draftToken,
  });
  return data;
}
