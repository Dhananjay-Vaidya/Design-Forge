import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import * as api from "@/features/insights/api";
import { ExplainerCard } from "@/features/insights/components/ExplainerCard";
import { SensitivityTab } from "@/features/insights/components/SensitivityTab";
import { VersionsTab } from "@/features/insights/components/VersionsTab";
import type { Explanation, Sensitivity, SnapshotDiff, SnapshotSummary } from "@/types/insights";

vi.mock("@/features/insights/api");

const SENSITIVITY: Sensitivity = {
  deterministic: true,
  leader: { alternative_id: "a", name: "Option A", points: 66.7 },
  runner_up: { alternative_id: "b", name: "Option B", points: 48.1 },
  margin_points: 18.5,
  tornado: [
    {
      criterion_id: "c1",
      name: "Salary",
      share_percent: 66.7,
      low_margin_points: 3.2,
      high_margin_points: 24.1,
      low_leader: "Option A",
      high_leader: "Option A",
      swing_points: 20.9,
      flips: false,
    },
    {
      criterion_id: "c2",
      name: "Growth",
      share_percent: 33.3,
      low_margin_points: 30.1,
      high_margin_points: -2.4,
      low_leader: "Option A",
      high_leader: "Option B",
      swing_points: 32.5,
      flips: true,
    },
  ],
  weight_flips: [
    {
      criterion_id: "c2",
      name: "Growth",
      challenger_id: "b",
      challenger_name: "Option B",
      direction: "increase",
      current_weight: 1,
      flip_weight: 2,
      current_share_percent: 33,
      flip_share_percent: 50,
      delta_points: 1,
    },
  ],
  score_flips: [
    {
      alternative_id: "a",
      alternative_name: "Option A",
      criterion_id: "c1",
      criterion_name: "Salary",
      role: "leader_down",
      current_score: 9,
      flip_score: 6.4,
      delta: 2.6,
      feasible: true,
    },
    {
      alternative_id: "b",
      alternative_name: "Option B",
      criterion_id: "c1",
      criterion_name: "Salary",
      role: "challenger_up",
      current_score: 4,
      flip_score: 10,
      delta: 6,
      feasible: false,
    },
  ],
  tornado_low_factor: 0.5,
  tornado_high_factor: 1.5,
};

const EXPLANATION: Explanation = {
  deterministic: true,
  headline: "Option A ranks first with 66.7 points, 18.5 ahead of Option B.",
  drivers: [{ criterion: "Salary", share_percent: 66.667, points: 59.259 }],
  ahead_on: [{ criterion: "Salary", points: 37.037 }],
  behind_on: [{ criterion: "Growth", points: -18.519 }],
  stability: "The lead is comfortable.",
  flip_hint: "Raising Growth to 50% of the total would change the leader.",
  text: "",
};

const snap = (version: number, label = ""): SnapshotSummary => ({
  id: `s${version}`,
  version,
  reason: "manual",
  label,
  created_at: new Date().toISOString(),
  complete: true,
  leader: "Option A",
  leader_points: 66.7,
});

const DIFF: SnapshotDiff = {
  a: { version: 1, label: "Before", created_at: null, is_current: false },
  b: { version: null, label: "Current", created_at: null, is_current: true },
  summary: ["Leader changed from Option A to Option B.", "2 scores changed."],
  decision_changes: [],
  alternatives: [],
  criteria: [],
  scores: [
    {
      alternative_id: "a",
      alternative: "Option A",
      criterion_id: "c1",
      criterion: "Salary",
      before: 9,
      after: 3,
    },
  ],
  score_cells_added: 0,
  score_cells_removed: 0,
  ranking: {
    available_before: true,
    available_after: true,
    leader_before: "Option A",
    leader_after: "Option B",
    leader_changed: true,
    moves: [
      {
        alternative_id: "b",
        name: "Option B",
        rank_before: 2,
        rank_after: 1,
        points_before: 48.1,
        points_after: 70,
        points_delta: 21.9,
        rank_delta: 1,
      },
      {
        alternative_id: "a",
        name: "Option A",
        rank_before: 1,
        rank_after: 2,
        points_before: 66.7,
        points_after: 40,
        points_delta: -26.7,
        rank_delta: -1,
      },
    ],
  },
};

function renderAt(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/decisions/d1/x"]}>
        <Routes>
          <Route path="/app/decisions/:decisionId/x" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const apiError = (status: number, fields?: Record<string, string[]>) =>
  new ApiError({ code: "ERR", message: "nope", fields }, status);

beforeEach(() => vi.resetAllMocks());

describe("SensitivityTab", () => {
  beforeEach(() => {
    vi.mocked(api.getSensitivity).mockResolvedValue(SENSITIVITY);
    vi.mocked(api.getExplanation).mockResolvedValue(EXPLANATION);
  });

  it("labels the analysis as calculated and states the margin", async () => {
    renderAt(<SensitivityTab />);
    expect(await screen.findByText(/Calculated, not AI/)).toBeInTheDocument();
    expect(screen.getByText(/Option A leads Option B by/)).toHaveTextContent("18.5");
  });

  it("shows status as icon plus text, never colour alone", async () => {
    renderAt(<SensitivityTab />);
    const list = await screen.findByRole("list", { name: /margin when each weight changes/i });
    const rows = within(list).getAllByRole("listitem");
    expect(within(rows[0]).getByText("Leader holds")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Can change the leader")).toBeInTheDocument();
  });

  it("describes the smallest weight and score changes, and the infeasible case", async () => {
    renderAt(<SensitivityTab />);
    expect(await screen.findByText(/takes the lead/)).toHaveTextContent(
      "Raise Growth from 33% to 50%",
    );
    expect(screen.getByText(/to at least/)).toHaveTextContent("9 to at least 6.4");
    expect(screen.getByText(/no score on the scale would change the leader/i)).toBeInTheDocument();
  });

  it("explains what is missing, with links, when the decision cannot be ranked", async () => {
    vi.mocked(api.getSensitivity).mockRejectedValue(apiError(400, { scores: ["missing"] }));
    renderAt(<SensitivityTab />);
    expect(await screen.findByText(/Finish scoring to explore what-ifs/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Criteria/ })).toBeInTheDocument();
  });

  it("offers a retry on a server error", async () => {
    vi.mocked(api.getSensitivity).mockRejectedValue(apiError(500));
    renderAt(<SensitivityTab />);
    const retry = await screen.findByRole(
      "button",
      { name: /try again|retry/i },
      { timeout: 4000 },
    );
    vi.mocked(api.getSensitivity).mockResolvedValue(SENSITIVITY);
    await userEvent.click(retry);
    expect(await screen.findByText(/Calculated, not AI/)).toBeInTheDocument();
  });
});

describe("ExplainerCard", () => {
  it("renders the template explanation", async () => {
    vi.mocked(api.getExplanation).mockResolvedValue(EXPLANATION);
    renderAt(<ExplainerCard decisionId="d1" />);
    expect(await screen.findByText(EXPLANATION.headline)).toBeInTheDocument();
    expect(screen.getByText(/Ahead on:/).parentElement).toHaveTextContent("Salary (+37.0)");
    expect(screen.getByText(/Behind on:/).parentElement).toHaveTextContent("Growth (-18.5)");
  });

  it("renders nothing when there is no ranking to explain", async () => {
    vi.mocked(api.getExplanation).mockRejectedValue(apiError(400));
    renderAt(<ExplainerCard decisionId="d1" />);
    await waitFor(() => expect(api.getExplanation).toHaveBeenCalled());
    expect(screen.queryByText("Why this ranks first")).toBeNull();
  });
});

describe("VersionsTab", () => {
  it("invites the first save when there are no versions", async () => {
    vi.mocked(api.listSnapshots).mockResolvedValue([]);
    renderAt(<VersionsTab />);
    expect(await screen.findByText("No saved versions yet")).toBeInTheDocument();
  });

  it("saves a labelled version", async () => {
    vi.mocked(api.listSnapshots).mockResolvedValue([]);
    vi.mocked(api.createSnapshot).mockResolvedValue(snap(1, "Before"));
    renderAt(<VersionsTab />);
    await userEvent.type(await screen.findByLabelText(/Save the current state/), "Before");
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    await waitFor(() => expect(api.createSnapshot).toHaveBeenCalled());
    expect(vi.mocked(api.createSnapshot).mock.calls[0].slice(0, 2)).toEqual(["d1", "Before"]);
  });

  it("compares the newest version with the live decision by default", async () => {
    vi.mocked(api.listSnapshots).mockResolvedValue([snap(2), snap(1, "Before")]);
    vi.mocked(api.compareSnapshots).mockResolvedValue(DIFF);
    renderAt(<VersionsTab />);
    expect(await screen.findByText("Leader changed from Option A to Option B.")).toBeVisible();
    expect(vi.mocked(api.compareSnapshots).mock.calls[0].slice(0, 3)).toEqual(["d1", 2, "current"]);
    const table = screen.getByRole("table");
    expect(within(table).getByText("+21.9")).toBeInTheDocument();
    expect(within(table).getByText("-26.7")).toBeInTheDocument();
  });

  it("lets the user pick which two versions to compare", async () => {
    vi.mocked(api.listSnapshots).mockResolvedValue([snap(2), snap(1, "Before")]);
    vi.mocked(api.compareSnapshots).mockResolvedValue(DIFF);
    renderAt(<VersionsTab />);
    await screen.findByText("Leader changed from Option A to Option B.");
    await userEvent.selectOptions(screen.getByLabelText("From"), "1");
    await userEvent.selectOptions(screen.getByLabelText("To"), "2");
    await waitFor(() =>
      expect(vi.mocked(api.compareSnapshots).mock.calls.at(-1)?.slice(0, 3)).toEqual(["d1", 1, 2]),
    );
  });

  it("does not compare a version with itself", async () => {
    vi.mocked(api.listSnapshots).mockResolvedValue([snap(1)]);
    renderAt(<VersionsTab />);
    await screen.findByLabelText("From");
    await waitFor(() => expect(api.compareSnapshots).toHaveBeenCalledTimes(1));
    await userEvent.selectOptions(screen.getByLabelText("To"), "1");
    expect(screen.getByText(/Pick two different versions/)).toBeInTheDocument();
    expect(api.compareSnapshots).toHaveBeenCalledTimes(1); // only the default compare with the live decision
  });
});
