import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import * as api from "@/features/landing/draftApi";
import { DraftHandoff } from "@/features/landing/DraftHandoff";
import { DRAFT_TTL_MS, loadDraft, saveDraft, type Scaffold } from "@/features/landing/draftStore";
import { HomeDrafter } from "@/features/landing/HomeDrafter";

vi.mock("@/features/landing/draftApi");

const SCAFFOLD: Scaffold = {
  title: "Which job offer should I take?",
  category: "Career",
  options: [
    { name: "Offer A", note: "Startup" },
    { name: "Offer B", note: "" },
  ],
  criteria: [
    { name: "Salary", description: "", direction: "benefit" },
    { name: "Commute time", description: "", direction: "cost" },
  ],
};

const STATUS = { enabled: true, free_drafts_per_day: 2, drafts_remaining: 2 };

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderDrafter() {
  render(
    <MemoryRouter>
      <HomeDrafter />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  vi.mocked(api.getGuideStatus).mockResolvedValue(STATUS);
});
afterEach(() => sessionStorage.clear());

describe("draftStore", () => {
  it("round-trips a draft and drops it once it is older than the token lifetime", () => {
    saveDraft({ scaffold: SCAFFOLD, token: "t", savedAt: 1_000 });
    expect(loadDraft(1_000 + 60_000)?.scaffold.title).toBe(SCAFFOLD.title);
    expect(loadDraft(1_000 + DRAFT_TTL_MS + 1)).toBeNull();
    expect(sessionStorage.getItem("df-home-draft")).toBeNull();
  });

  it("ignores corrupt or foreign data", () => {
    sessionStorage.setItem("df-home-draft", "{not json");
    expect(loadDraft()).toBeNull();
    sessionStorage.setItem("df-home-draft", JSON.stringify({ token: 1 }));
    expect(loadDraft()).toBeNull();
  });
});

describe("HomeDrafter", () => {
  it("needs a real description and says nothing is saved", async () => {
    renderDrafter();
    const button = screen.getByRole("button", { name: "Draft it for me" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/Nothing is saved until you create an account/)).toBeInTheDocument();
    expect(await screen.findByText(/2 free drafts left today/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /startup that pays more/ }));
    expect(button).toBeEnabled();
  });

  it("drafts, previews the matrix with nothing scored, and keeps the draft in this tab only", async () => {
    vi.mocked(api.draftDecision).mockResolvedValue({
      status: "ok",
      scaffold: SCAFFOLD,
      draft_token: "tok",
      drafts_remaining: 1,
      message: null,
      from_cache: false,
    });
    renderDrafter();
    await userEvent.type(
      screen.getByLabelText(/Describe a decision/),
      "Two job offers to choose from",
    );
    await userEvent.click(screen.getByRole("button", { name: "Draft it for me" }));
    expect(await screen.findByRole("heading", { name: SCAFFOLD.title })).toBeInTheDocument();
    expect(vi.mocked(api.draftDecision).mock.calls[0][0]).toBe("Two job offers to choose from");

    expect(screen.getByText("AI-drafted · you review everything")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Not scored yet")).toHaveLength(4);
    expect(within(table).getByText("Lower is better")).toBeInTheDocument();
    expect(screen.getByText(/Weights start equal \(50% each\)/)).toBeInTheDocument();
    expect(screen.getByText("Nothing is saved yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Save & start scoring/ })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(loadDraft()?.token).toBe("tok");
  });

  it("lets the visitor tweak the draft, within sensible minimums", async () => {
    saveDraft({ scaffold: SCAFFOLD, token: "tok", savedAt: Date.now() });
    renderDrafter();
    // Two options is the minimum: removing one is not allowed.
    expect(screen.getByRole("button", { name: "Remove option Offer A" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Add an option"), "Stay put");
    await userEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    expect(screen.getByRole("rowheader", { name: /Stay put/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove option Offer A" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove criterion Salary" }));
    await userEvent.type(screen.getByLabelText("Add a criterion"), "Risk");
    await userEvent.selectOptions(screen.getByLabelText("Direction"), "cost");
    await userEvent.click(screen.getAllByRole("button", { name: "Add" })[1]);
    const stored = loadDraft()!.scaffold;
    expect(stored.options.map((o) => o.name)).toEqual(["Offer B", "Stay put"]);
    expect(stored.criteria).toEqual([
      { name: "Commute time", description: "", direction: "cost" },
      { name: "Risk", description: "", direction: "cost" },
    ]);
  });

  it("starts over by forgetting the draft", async () => {
    saveDraft({ scaffold: SCAFFOLD, token: "tok", savedAt: Date.now() });
    renderDrafter();
    await userEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByLabelText(/Describe a decision/)).toBeInTheDocument();
    expect(loadDraft()).toBeNull();
  });

  it.each([
    ["capped", "You've used today's free drafts."],
    ["degraded", "The AI drafter isn't available right now."],
  ] as const)("offers templates when the result is %s", async (status, message) => {
    vi.mocked(api.draftDecision).mockResolvedValue({
      status,
      scaffold: null,
      draft_token: null,
      drafts_remaining: 0,
      message,
      from_cache: false,
    });
    renderDrafter();
    await userEvent.type(
      screen.getByLabelText(/Describe a decision/),
      "Two job offers to choose from",
    );
    await userEvent.click(screen.getByRole("button", { name: "Draft it for me" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(within(alert).getByRole("link", { name: /Start from a template/ })).toHaveAttribute(
      "href",
      "/app/templates",
    );
    expect(loadDraft()).toBeNull();
  });

  it("explains a refusal without pushing templates", async () => {
    vi.mocked(api.draftDecision).mockResolvedValue({
      status: "refused",
      scaffold: null,
      draft_token: null,
      drafts_remaining: 2,
      message: "That doesn't read like a decision between options.",
      from_cache: false,
    });
    renderDrafter();
    await userEvent.type(
      screen.getByLabelText(/Describe a decision/),
      "Write me a poem about rain",
    );
    await userEvent.click(screen.getByRole("button", { name: "Draft it for me" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("doesn't read like a decision");
    expect(within(alert).queryByRole("link")).toBeNull();
  });

  it("shows the friendly rate-limit message", async () => {
    vi.mocked(api.draftDecision).mockRejectedValue(
      new ApiError(
        {
          code: "rate_limited",
          message: "Lots of people are drafting right now. Please try again in a minute.",
        },
        429,
      ),
    );
    renderDrafter();
    await userEvent.type(
      screen.getByLabelText(/Describe a decision/),
      "Two job offers to choose from",
    );
    await userEvent.click(screen.getByRole("button", { name: "Draft it for me" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("try again in a minute");
  });

  it("says when the drafter is off and still offers templates", async () => {
    vi.mocked(api.getGuideStatus).mockResolvedValue({ ...STATUS, enabled: false });
    renderDrafter();
    expect(await screen.findByText(/switched off right now/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start from a template/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft it for me" })).toBeDisabled();
  });

  it("renders AI text as text, never as HTML", async () => {
    saveDraft({
      scaffold: { ...SCAFFOLD, title: "<img src=x onerror=alert(1)>Which?" },
      token: "tok",
      savedAt: Date.now(),
    });
    renderDrafter();
    expect(screen.getByRole("heading", { level: 3 }).textContent).toContain(
      "<img src=x onerror=alert(1)>",
    );
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("DraftHandoff", () => {
  function renderShell() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app"]}>
          <DraftHandoff />
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("does nothing when there is no draft", () => {
    renderShell();
    expect(api.saveScaffold).not.toHaveBeenCalled();
    expect(screen.getByTestId("where")).toHaveTextContent("/app");
  });

  it("saves the draft once, clears it and lands on the Scores tab", async () => {
    saveDraft({ scaffold: SCAFFOLD, token: "tok", savedAt: Date.now() });
    vi.mocked(api.saveScaffold).mockResolvedValue({ id: "d9" } as never);
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("where")).toHaveTextContent("/app/decisions/d9/scores"),
    );
    expect(api.saveScaffold).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.saveScaffold).mock.calls[0]).toEqual([SCAFFOLD, "tok"]);
    expect(loadDraft()).toBeNull();
  });

  it("falls back to an empty new decision when the draft is no longer valid", async () => {
    saveDraft({ scaffold: SCAFFOLD, token: "old", savedAt: Date.now() });
    vi.mocked(api.saveScaffold).mockRejectedValue(
      new ApiError({ code: "validation_error", message: "x" }, 400),
    );
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("where")).toHaveTextContent("/app/decisions/new"),
    );
    expect(loadDraft()).toBeNull();
  });

  it("keeps the draft for a retry when the server can't be reached", async () => {
    saveDraft({ scaffold: SCAFFOLD, token: "tok", savedAt: Date.now() });
    vi.mocked(api.saveScaffold).mockRejectedValue(new Error("network"));
    renderShell();
    await waitFor(() => expect(api.saveScaffold).toHaveBeenCalled());
    expect(screen.getByTestId("where")).toHaveTextContent("/app");
    expect(loadDraft()?.token).toBe("tok");
  });

  it("drops an expired draft without calling the server", () => {
    saveDraft({ scaffold: SCAFFOLD, token: "tok", savedAt: Date.now() - DRAFT_TTL_MS - 1 });
    renderShell();
    expect(api.saveScaffold).not.toHaveBeenCalled();
  });
});
