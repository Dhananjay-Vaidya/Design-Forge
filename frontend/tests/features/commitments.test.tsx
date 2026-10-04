import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import * as api from "@/features/commitments/api";
import { CommitTab } from "@/features/commitments/components/CommitTab";
import * as decisionsApi from "@/features/decisions/api";
import { CalibrationPage } from "@/pages/CalibrationPage";
import type { Calibration, Commitment, OutcomeReview } from "@/types/commitment";
import type { Decision, Ranking } from "@/types/decision";

vi.mock("@/features/commitments/api");
vi.mock("@/features/decisions/api");

const decision = (status: Decision["status"]): Decision => ({
  id: "d1",
  title: "Job choice",
  context: "",
  category: "Career",
  status,
  deadline: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  archived_at: null,
});

const ALTS = [
  { id: "a", decision_id: "d1", name: "Option A", description: "", position: 0 },
  { id: "b", decision_id: "d1", name: "Option B", description: "", position: 1 },
];

const RANKING: Ranking = {
  decision_id: "d1",
  deterministic: true,
  computed_at: "2026-01-01T00:00:00Z",
  calculation_method: "weighted-sum.v1",
  weights_normalized: {},
  ranking: [
    { rank: 1, alternative_id: "a", name: "Option A", total: "0.667", breakdown: {} },
    { rank: 2, alternative_id: "b", name: "Option B", total: "0.481", breakdown: {} },
  ],
  sensitivity: { leader_stable: true, note: "", margin: "0.18" },
};

const COMMITMENT: Commitment = {
  id: "c1",
  decision_id: "d1",
  alternative_id: "a",
  alternative_name: "Option A",
  confidence: 72,
  rationale: "Best balance",
  is_active: true,
  snapshot_version: 3,
  created_at: new Date().toISOString(),
};

const review = (over: Partial<OutcomeReview> = {}): OutcomeReview => ({
  id: "r1",
  decision_id: "d1",
  commitment_id: "c1",
  due_at: new Date(Date.now() + 86_400_000 * 30).toISOString(),
  status: "SCHEDULED",
  satisfaction: null,
  result_notes: "",
  submitted_at: null,
  created_at: new Date().toISOString(),
  ...over,
});

function renderAt(ui: ReactNode, path = "/app/decisions/d1/commit") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/decisions/:decisionId/commit" element={ui} />
          <Route path="/app/calibration" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setup(
  status: Decision["status"],
  commitments: Commitment[] = [],
  reviews: OutcomeReview[] = [],
) {
  vi.mocked(decisionsApi.getDecision).mockResolvedValue(decision(status));
  vi.mocked(decisionsApi.listAlternatives).mockResolvedValue(ALTS as never);
  vi.mocked(decisionsApi.getRanking).mockResolvedValue(RANKING);
  vi.mocked(api.listCommitments).mockResolvedValue(commitments);
  vi.mocked(api.listOutcomes).mockResolvedValue(reviews);
}

beforeEach(() => vi.resetAllMocks());

describe("CommitTab", () => {
  it("explains what is missing instead of offering a commit on an unfinished decision", async () => {
    setup("DRAFT");
    renderAt(<CommitTab />);
    expect(await screen.findByText("Finish scoring before you commit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to scores/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Commit/ })).toBeNull();
  });

  it("starts on the calculated leader and sends the choice, confidence and rationale", async () => {
    setup("SCORED");
    vi.mocked(api.commitDecision).mockResolvedValue(COMMITMENT);
    renderAt(<CommitTab />);
    const button = await screen.findByRole("button", { name: "Commit to Option A" });
    expect(screen.getByRole("radio", { name: /Option A/ })).toBeChecked();
    expect(screen.getByText(/Top ranked/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Why\?/), "Best balance");
    await userEvent.click(button);
    await waitFor(() => expect(api.commitDecision).toHaveBeenCalled());
    expect(vi.mocked(api.commitDecision).mock.calls[0].slice(0, 2)).toEqual([
      "d1",
      { alternative_id: "a", confidence: 70, rationale: "Best balance" },
    ]);
  });

  it("allows a non-leader and says so without blocking", async () => {
    setup("SCORED");
    vi.mocked(api.commitDecision).mockResolvedValue({ ...COMMITMENT, alternative_id: "b" });
    renderAt(<CommitTab />);
    await userEvent.click(await screen.findByRole("radio", { name: /Option B/ }));
    expect(screen.getByText(/isn't the top-ranked option/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Commit to Option B" }));
    await waitFor(() => expect(api.commitDecision).toHaveBeenCalled());
    expect(vi.mocked(api.commitDecision).mock.calls[0][1]).toMatchObject({ alternative_id: "b" });
  });

  it("shows the server's reason when the commit is refused", async () => {
    setup("SCORED");
    vi.mocked(api.commitDecision).mockRejectedValue(
      new ApiError({ code: "ERR", message: "Choose one of this decision's options." }, 400),
    );
    renderAt(<CommitTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Commit to Option A" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose one of this decision's options.",
    );
  });

  it("shows the active commitment, its history, and lets the user change it", async () => {
    const older = {
      ...COMMITMENT,
      id: "c0",
      alternative_name: "Option B",
      is_active: false,
      confidence: 40,
    };
    setup("COMMITTED", [COMMITMENT, older]);
    renderAt(<CommitTab />);
    expect(await screen.findByRole("heading", { name: "Option A" })).toBeInTheDocument();
    expect(screen.getByText(/saved as version 3/)).toBeInTheDocument();
    expect(screen.getByText("Earlier commitments (1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update commitment" })).toBeInTheDocument();
  });

  it("locks the commitment once a review is due", async () => {
    setup("UNDER_REVIEW", [COMMITMENT], [review({ status: "DUE" })]);
    renderAt(<CommitTab />);
    expect(await screen.findByRole("heading", { name: "Option A" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update commitment" })).toBeNull();
    expect(screen.getByText("Review due")).toBeInTheDocument();
  });
});

describe("OutcomeSection", () => {
  it("schedules a review at 09:00 local on the chosen date, as an unambiguous instant", async () => {
    setup("COMMITTED", [COMMITMENT]);
    vi.mocked(api.createOutcome).mockResolvedValue(review());
    renderAt(<CommitTab />);
    const date = await screen.findByLabelText("Review on");
    await userEvent.clear(date);
    await userEvent.type(date, "2099-06-15");
    await userEvent.click(screen.getByRole("button", { name: "Schedule review" }));
    await waitFor(() => expect(api.createOutcome).toHaveBeenCalled());
    const body = vi.mocked(api.createOutcome).mock.calls[0][1];
    expect(body.due_at).toBe(new Date("2099-06-15T09:00:00").toISOString());
    expect(body.due_at).toMatch(/Z$/);
  });

  it("offers quick dates", async () => {
    setup("COMMITTED", [COMMITMENT]);
    renderAt(<CommitTab />);
    const group = await screen.findByRole("group", { name: "Quick review dates" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["1 mo", "3 mo", "6 mo", "1 year"]);
  });

  it("requires a rating before recording an outcome, then records it", async () => {
    setup("UNDER_REVIEW", [COMMITMENT], [review({ status: "DUE" })]);
    vi.mocked(api.submitOutcome).mockResolvedValue(
      review({ status: "SUBMITTED", satisfaction: 4 }),
    );
    renderAt(<CommitTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Record outcome" }));
    await userEvent.click(screen.getByRole("button", { name: "Record outcome" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick how it turned out.");
    expect(api.submitOutcome).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("radio", { name: /Happy/ }));
    await userEvent.type(screen.getByLabelText(/What happened/), "Good call");
    await userEvent.click(screen.getByRole("button", { name: "Record outcome" }));
    await waitFor(() => expect(api.submitOutcome).toHaveBeenCalled());
    expect(vi.mocked(api.submitOutcome).mock.calls[0].slice(0, 2)).toEqual([
      "r1",
      { satisfaction: 4, result_notes: "Good call" },
    ]);
  });

  it("shows a recorded outcome with its rating in words", async () => {
    setup(
      "REVIEWED",
      [COMMITMENT],
      [
        review({
          status: "SUBMITTED",
          satisfaction: 2,
          result_notes: "Meh",
          submitted_at: new Date().toISOString(),
        }),
      ],
    );
    renderAt(<CommitTab />);
    expect(await screen.findByText("Recorded")).toBeInTheDocument();
    expect(screen.getByText("2/5")).toBeInTheDocument();
    expect(screen.getByText(/· Unhappy/)).toBeInTheDocument();
    expect(screen.getByText("Meh")).toBeInTheDocument();
  });

  it("records an outcome right away without a scheduled review", async () => {
    setup("COMMITTED", [COMMITMENT]);
    vi.mocked(api.createOutcome).mockResolvedValue(
      review({ status: "SUBMITTED", satisfaction: 5 }),
    );
    renderAt(<CommitTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Record the outcome now" }));
    await userEvent.click(screen.getByRole("radio", { name: /Very happy/ }));
    await userEvent.click(screen.getByRole("button", { name: "Record outcome" }));
    await waitFor(() => expect(api.createOutcome).toHaveBeenCalled());
    expect(vi.mocked(api.createOutcome).mock.calls[0][1]).toEqual({
      satisfaction: 5,
      result_notes: "",
    });
  });
});

const CAL: Calibration = {
  deterministic: true,
  reviews_count: 5,
  sufficient: true,
  min_reviews: 5,
  success_threshold: 4,
  avg_confidence: 68,
  avg_satisfaction: 3.4,
  success_rate: 0.6,
  brier_score: 0.188,
  brier_baseline: 0.24,
  brier_skill: 0.217,
  verdict: "overconfident",
  buckets: [
    {
      confidence_range: "0-19",
      count: 0,
      avg_confidence: null,
      success_rate: null,
      avg_satisfaction: null,
    },
    {
      confidence_range: "80-100",
      count: 3,
      avg_confidence: 83.3,
      success_rate: 0.667,
      avg_satisfaction: 4,
    },
  ],
  categories: [
    {
      category: "Career",
      count: 3,
      avg_confidence: 73.3,
      success_rate: 0.667,
      gap_points: 6.7,
      verdict: "well_calibrated",
    },
    {
      category: "Money",
      count: 2,
      avg_confidence: 90,
      success_rate: 0,
      gap_points: 90,
      verdict: "not_enough_data",
    },
  ],
  streaks: { current: 3, best: 4 },
  note: "Decisions have worked out less often than your confidence suggested.",
};

describe("CalibrationPage", () => {
  it("invites the first review when there is nothing yet", async () => {
    vi.mocked(api.getCalibration).mockResolvedValue({ ...CAL, reviews_count: 0, note: "" });
    renderAt(<CalibrationPage />, "/app/calibration");
    expect(await screen.findByText("No outcomes recorded yet")).toBeInTheDocument();
  });

  it("states the read in words with an icon, never colour alone, and labels it calculated", async () => {
    vi.mocked(api.getCalibration).mockResolvedValue(CAL);
    renderAt(<CalibrationPage />, "/app/calibration");
    expect(await screen.findByRole("heading", { name: "Overconfident" })).toBeInTheDocument();
    expect(screen.getByText(CAL.note)).toBeInTheDocument();
    expect(screen.getAllByText("Calculated, not AI").length).toBeGreaterThan(0);
    const cats = screen.getByRole("table", { name: /per decision category/i });
    expect(within(cats).getByText("Well calibrated")).toBeInTheDocument();
    expect(within(cats).getByText("Not enough data")).toBeInTheDocument();
  });

  it("reports the headline numbers and the streaks", async () => {
    vi.mocked(api.getCalibration).mockResolvedValue(CAL);
    renderAt(<CalibrationPage />, "/app/calibration");
    await screen.findByRole("heading", { name: "Overconfident" });
    expect(screen.getByText("0.19")).toBeInTheDocument(); // Brier 0.188
    expect(screen.getByText("68%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Current streak").previousElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Best streak").previousElementSibling).toHaveTextContent("4");
  });

  it("calls an early sample early instead of judging it", async () => {
    vi.mocked(api.getCalibration).mockResolvedValue({
      ...CAL,
      reviews_count: 2,
      sufficient: false,
      verdict: null,
      note: "2 of 5 reviews so far.",
    });
    renderAt(<CalibrationPage />, "/app/calibration");
    expect(await screen.findByRole("heading", { name: "Still collecting" })).toBeInTheDocument();
  });

  it("offers a retry when it cannot load", async () => {
    vi.mocked(api.getCalibration).mockRejectedValue(new ApiError({ code: "E", message: "x" }, 500));
    renderAt(<CalibrationPage />, "/app/calibration");
    expect(
      await screen.findByRole("button", { name: /try again|retry/i }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });
});
