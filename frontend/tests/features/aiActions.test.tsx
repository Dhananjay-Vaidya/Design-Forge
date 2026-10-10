import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import * as aiApi from "@/features/ai/api";
import * as api from "@/features/ai/actions/api";
import { AiBudgetMeter } from "@/features/ai/actions/components/AiParts";
import { AiHelpTab } from "@/features/ai/actions/components/AiHelpTab";
import * as decisionsApi from "@/features/decisions/api";
import type { Proposal, RunActionResponse } from "@/types/aiActions";
import type { Decision } from "@/types/decision";

vi.mock("@/features/ai/actions/api");
vi.mock("@/features/ai/api");
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

const STATUS = {
  enabled: true,
  model: "fake-chat",
  daily_limit: 20,
  remaining_today: 7,
  disclaimer: "Advisory analysis only.",
};

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: "p1",
  decision_id: "d1",
  action: "setup_draft",
  kind: "proposal",
  status: "READY",
  prompt_version: "v1",
  model: "fake-chat",
  payload: {
    summary: "Two offers; judge them on pay and commute.",
    items: [
      { id: "i1", kind: "option", label: "Offer A", detail: "Startup", data: {} },
      { id: "i2", kind: "option", label: "Offer B", detail: "", data: {} },
      { id: "i3", kind: "criterion", label: "Commute time", detail: "Lower is better", data: {} },
    ],
  },
  resolution: {},
  cache_hit: false,
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  resolved_at: null,
  advisory: true,
  ...over,
});

const advisory = (): Proposal =>
  proposal({
    id: "p2",
    action: "decision_brief",
    kind: "advisory",
    payload: {
      summary: "Chose the stronger salary.",
      sections: [
        {
          heading: "Facts",
          source: "calculated",
          bullets: ["Committed to Offer A with 72% confidence."],
        },
        {
          heading: "Risks to watch",
          source: "ai",
          bullets: ["<img src=x onerror=alert(1)> Startup may not last"],
        },
      ],
    },
  });

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/decisions/d1/ai"]}>
        <Routes>
          <Route path="/app/decisions/:decisionId/ai" element={<AiHelpTab />} />
          <Route path="/app/decisions/:decisionId/criteria" element={<p>criteria page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setup(status: Decision["status"], proposals: Proposal[] = [], aiStatus = STATUS) {
  vi.mocked(decisionsApi.getDecision).mockResolvedValue(decision(status));
  vi.mocked(aiApi.getAIStatus).mockResolvedValue(aiStatus);
  vi.mocked(api.listProposals).mockResolvedValue(proposals);
}

beforeEach(() => vi.resetAllMocks());

describe("AiBudgetMeter", () => {
  function renderMeter() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AiBudgetMeter />
      </QueryClientProvider>,
    );
  }

  it("shows what is left of today's budget", async () => {
    vi.mocked(aiApi.getAIStatus).mockResolvedValue(STATUS);
    renderMeter();
    const meter = await screen.findByRole("meter", { name: "AI actions left today" });
    expect(meter).toHaveAttribute("aria-valuetext", "7 of 20 AI actions left today");
    expect(meter).toHaveTextContent("7 of 20 AI actions left today");
  });

  it("says when it resets once it runs out", async () => {
    vi.mocked(aiApi.getAIStatus).mockResolvedValue({ ...STATUS, remaining_today: 0 });
    renderMeter();
    expect(await screen.findByText(/resets at midnight UTC/)).toBeInTheDocument();
  });

  it("renders nothing when AI is off", async () => {
    vi.mocked(aiApi.getAIStatus).mockResolvedValue({ ...STATUS, enabled: false });
    renderMeter();
    await waitFor(() => expect(aiApi.getAIStatus).toHaveBeenCalled());
    expect(screen.queryByRole("meter")).toBeNull();
  });
});

describe("AiHelpTab availability", () => {
  it("explains the AI is off and disables every action, without blocking anything else", async () => {
    setup("SCORED", [], { ...STATUS, enabled: false });
    renderTab();
    expect(
      await screen.findByText(/switched off on this server/i, { selector: "p" }),
    ).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: /Draft with AI|Run|Write brief/ })) {
      expect(button).toBeDisabled();
    }
  });

  it("tells you what each capability needs before it can run", async () => {
    setup("DRAFT");
    renderTab();
    expect(await screen.findByText(/Finish scoring first/)).toBeInTheDocument();
    expect(screen.getByText("Commit to an option first.")).toBeInTheDocument();
    expect(screen.getByText("Record how it turned out first.")).toBeInTheDocument();
    const challenge = screen
      .getByRole("heading", { name: "Challenge the leader" })
      .closest(".card") as HTMLElement;
    expect(within(challenge).getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("enables only what the decision's stage allows", async () => {
    setup("COMMITTED");
    renderTab();
    const brief = (await screen.findByRole("heading", { name: "Decision brief" })).closest(
      ".card",
    ) as HTMLElement;
    expect(within(brief).getByRole("button", { name: "Write brief" })).toBeEnabled();
    const coach = screen
      .getByRole("heading", { name: "Outcome coach" })
      .closest(".card") as HTMLElement;
    expect(within(coach).getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("states that nothing changes the calculated result", async () => {
    setup("SCORED");
    renderTab();
    expect(
      await screen.findByText(/nothing here changes your calculated scores, weights or ranking/i),
    ).toBeInTheDocument();
  });
});

describe("running an action", () => {
  it("needs a real description before drafting", async () => {
    setup("DRAFT");
    renderTab();
    const draft = await screen.findByRole("button", { name: "Draft with AI" });
    expect(draft).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText("Describe your decision"),
      "Two job offers to compare",
    );
    expect(draft).toBeEnabled();
  });

  it("sends the description and shows the staged proposal", async () => {
    setup("DRAFT");
    const ready: RunActionResponse = {
      status: "READY",
      proposal: proposal(),
      remaining_today: 6,
      failure_code: null,
      message: null,
    };
    vi.mocked(api.runAction).mockImplementation(async () => {
      vi.mocked(api.listProposals).mockResolvedValue([proposal()]);
      return ready;
    });
    renderTab();
    await userEvent.type(
      await screen.findByLabelText("Describe your decision"),
      "Two job offers to compare",
    );
    await userEvent.click(screen.getByRole("button", { name: "Draft with AI" }));
    await waitFor(() => expect(api.runAction).toHaveBeenCalled());
    expect(vi.mocked(api.runAction).mock.calls[0]).toEqual([
      "d1",
      "setup_draft",
      { description: "Two job offers to compare" },
    ]);
    expect(
      await screen.findByText("Two offers; judge them on pay and commute."),
    ).toBeInTheDocument();
  });

  it("says an unusable answer was discarded and cost nothing", async () => {
    setup("DRAFT");
    vi.mocked(api.runAction).mockResolvedValue({
      status: "FAILED",
      proposal: null,
      failure_code: "schema_invalid",
      message: "The AI response could not be validated and was discarded. No suggestion is shown.",
      remaining_today: 7,
    });
    renderTab();
    await userEvent.type(
      await screen.findByLabelText("Describe your decision"),
      "Two job offers to compare",
    );
    await userEvent.click(screen.getByRole("button", { name: "Draft with AI" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("was discarded");
    expect(alert).toHaveTextContent("didn't use any of your daily AI actions");
  });

  it("shows the server's plain explanation when the provider is down or the budget is spent", async () => {
    setup("SCORED");
    vi.mocked(api.runAction).mockRejectedValue(
      new ApiError(
        {
          code: "quota_exhausted",
          message:
            "You've used today's 20 AI actions. The limit resets at midnight UTC; everything else keeps working.",
        },
        429,
      ),
    );
    renderTab();
    const challenge = (
      await screen.findByRole("heading", { name: "Challenge the leader" })
    ).closest(".card") as HTMLElement;
    await userEvent.click(within(challenge).getByRole("button", { name: "Run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("resets at midnight UTC");
  });
});

describe("reviewing a proposal", () => {
  it("pre-ticks every item and adds exactly the ticked ones", async () => {
    setup("DRAFT", [proposal()]);
    vi.mocked(api.acceptProposal).mockResolvedValue(
      proposal({
        resolution: {
          i1: { status: "accepted", at: "", created: { type: "option", id: "x" } },
          i3: { status: "accepted", at: "", created: { type: "criterion", id: "y" } },
        },
      }),
    );
    renderTab();
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    await userEvent.click(screen.getByRole("checkbox", { name: /Offer B/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add selected (2)" }));
    await waitFor(() => expect(api.acceptProposal).toHaveBeenCalled());
    expect(vi.mocked(api.acceptProposal).mock.calls[0].slice(0, 2)).toEqual(["p1", ["i1", "i3"]]);
  });

  it("cannot add nothing", async () => {
    setup("DRAFT", [proposal()]);
    renderTab();
    for (const box of await screen.findAllByRole("checkbox")) await userEvent.click(box);
    expect(screen.getByRole("button", { name: "Add selected (0)" })).toBeDisabled();
  });

  it("explains that weights are the person's to set", async () => {
    setup("DRAFT", [proposal()]);
    renderTab();
    expect(await screen.findByText(/Criteria start with equal weight/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criteria tab" })).toHaveAttribute(
      "href",
      expect.stringMatching(/criteria$/),
    );
  });

  it("shows what happened to each decided item in words, including a failure", async () => {
    setup("DRAFT", [
      proposal({
        resolution: {
          i1: { status: "accepted", at: "" },
          i2: {
            status: "failed",
            at: "",
            message: "An alternative with this name already exists in this decision.",
          },
          i3: { status: "rejected", at: "" },
        },
      }),
    ]);
    renderTab();
    expect(await screen.findByText("Added to your decision")).toBeInTheDocument();
    expect(
      screen.getByText(/Couldn't add: An alternative with this name already exists/),
    ).toBeInTheDocument();
    expect(screen.getByText("Dismissed")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("dismisses a whole proposal", async () => {
    setup("DRAFT", [proposal()]);
    vi.mocked(api.rejectProposal).mockResolvedValue(proposal({ status: "REJECTED" }));
    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: "Dismiss all" }));
    await waitFor(() => expect(api.rejectProposal).toHaveBeenCalled());
    expect(vi.mocked(api.rejectProposal).mock.calls[0][0]).toBe("p1");
  });

  it("shows the model and prompt version behind each suggestion", async () => {
    setup("DRAFT", [proposal({ cache_hit: true })]);
    renderTab();
    const line = await screen.findByText(/prompt v1/);
    expect(line).toHaveTextContent("fake-chat");
    expect(screen.getByText(/reused from an identical earlier request/)).toBeInTheDocument();
  });
});

describe("advisory suggestions", () => {
  it("keeps calculated facts and AI text visibly apart", async () => {
    setup("COMMITTED", [advisory()]);
    renderTab();
    const facts = (await screen.findByRole("region", { name: "Facts" })) as HTMLElement;
    expect(within(facts).getByText("Calculated from your data")).toBeInTheDocument();
    const risks = screen.getByRole("region", { name: "Risks to watch" });
    expect(within(risks).queryByText("Calculated from your data")).toBeNull();
    expect(screen.getByText("AI draft · Advisory")).toBeInTheDocument();
    expect(
      screen.getByText(/Advisory only\. Your calculated ranking and scores are unchanged/),
    ).toBeInTheDocument();
  });

  it("renders AI text as plain text, never as HTML", async () => {
    setup("COMMITTED", [advisory()]);
    const { container } = (renderTab(), { container: document.body });
    const item = await screen.findByText(/Startup may not last/);
    expect(item.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
  });

  it("can be dismissed but has nothing to add", async () => {
    setup("COMMITTED", [advisory()]);
    vi.mocked(api.rejectProposal).mockResolvedValue({ ...advisory(), status: "REJECTED" });
    renderTab();
    expect(await screen.findByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add selected/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(api.rejectProposal).toHaveBeenCalled());
  });

  it("keeps closed suggestions out of the way under an earlier-suggestions list", async () => {
    setup("COMMITTED", [{ ...advisory(), status: "REJECTED" }]);
    renderTab();
    const summary = await screen.findByText("Earlier suggestions (1)");
    expect(summary.closest("details")).not.toHaveAttribute("open");
  });
});

describe("after a run finishes", () => {
  it("brings the new suggestion into view above the cards and moves focus to it", async () => {
    setup("DRAFT");
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    vi.mocked(api.runAction).mockImplementation(async () => {
      vi.mocked(api.listProposals).mockResolvedValue([proposal()]);
      return {
        status: "READY",
        proposal: proposal(),
        remaining_today: 6,
        failure_code: null,
        message: null,
      };
    });
    renderTab();
    await userEvent.type(
      await screen.findByLabelText("Describe your decision"),
      "Two job offers to compare",
    );
    await userEvent.click(screen.getByRole("button", { name: "Draft with AI" }));

    const card = await screen.findByRole("article", { name: "setup_draft suggestion" });
    await waitFor(() => expect(card).toHaveFocus());
    expect(scrolled).toHaveBeenCalled();
    expect(screen.getByText("Suggestion ready to review.")).toBeInTheDocument();
    // The suggestion sits above the capability cards, not below them.
    const heading = screen.getByRole("heading", { name: /Suggestions to review/ });
    const setupCard = screen.getByRole("heading", { name: "Draft options and criteria" });
    expect(
      heading.compareDocumentPosition(setupCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
