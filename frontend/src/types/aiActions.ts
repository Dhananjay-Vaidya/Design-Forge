export type ActionKind = "proposal" | "advisory";

export interface ActionInfo {
  name: string;
  title: string;
  description: string;
  kind: ActionKind;
  prompt_version: string;
}

export type ProposalStatus = "QUEUED" | "READY" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export interface ProposalItem {
  id: string;
  kind: string;
  label: string;
  detail: string;
  data: Record<string, unknown>;
}

export interface AdvisorySection {
  heading: string;
  bullets: string[];
  /** "calculated" = a fact computed from the person's own data; "ai" = model-written draft text. */
  source: "calculated" | "ai";
}

export interface ItemResolution {
  status: "accepted" | "rejected" | "failed";
  at: string;
  message?: string;
  created?: { type: string; id: string };
}

export interface Proposal {
  id: string;
  decision_id: string;
  action: string;
  kind: ActionKind;
  status: ProposalStatus;
  prompt_version: string;
  model: string;
  payload: {
    summary: string;
    items?: ProposalItem[];
    sections?: AdvisorySection[];
  };
  resolution: Record<string, ItemResolution>;
  cache_hit: boolean;
  created_at: string;
  expires_at: string;
  resolved_at: string | null;
  advisory: true;
}

export interface RunActionResponse {
  status: "READY" | "FAILED";
  proposal: Proposal | null;
  failure_code: string | null;
  message: string | null;
  remaining_today: number | null;
}
