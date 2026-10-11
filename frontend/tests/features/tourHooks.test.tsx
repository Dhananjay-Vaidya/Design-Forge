import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/features/templates/api";
import { TourProvider, hasSeenTour, markTourSeen, startTourAction, tours } from "@/features/tour";
import { WorkspaceTourNudge } from "@/features/tour/WorkspaceTourNudge";
import type { Decision } from "@/types/decision";

vi.mock("@/features/templates/api");

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderNudge() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <WorkspaceTourNudge />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe("dashboard first-run tour nudge", () => {
  it("shows an opt-in button, not an overlay", () => {
    vi.mocked(api.getDemo).mockResolvedValue({ decision_id: null });
    renderNudge();
    expect(screen.getByRole("button", { name: "Take a quick tour" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show when the workspace tour was already seen", () => {
    markTourSeen("workspace");
    vi.mocked(api.getDemo).mockResolvedValue({ decision_id: null });
    renderNudge();
    expect(screen.queryByRole("button", { name: "Take a quick tour" })).toBeNull();
  });

  it("can be dismissed for good", async () => {
    vi.mocked(api.getDemo).mockResolvedValue({ decision_id: null });
    renderNudge();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss the tour suggestion" }));
    expect(screen.queryByRole("note", { name: "Quick tour" })).toBeNull();
    expect(hasSeenTour("workspace")).toBe(true);
  });

  it("opens the existing sample with the tour, without replacing it", async () => {
    vi.mocked(api.getDemo).mockResolvedValue({ decision_id: "sample-1" });
    renderNudge();
    const button = screen.getByRole("button", { name: "Take a quick tour" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(screen.getByTestId("where")).toHaveTextContent("/app/decisions/sample-1/ranking?tour=1");
    expect(api.createDemo).not.toHaveBeenCalled();
  });

  it("creates a sample when there is none, then starts the tour on it", async () => {
    vi.mocked(api.getDemo).mockResolvedValue({ decision_id: null });
    vi.mocked(api.createDemo).mockResolvedValue({ id: "new-sample" } as Decision);
    renderNudge();
    const button = screen.getByRole("button", { name: "Take a quick tour" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await waitFor(() =>
      expect(screen.getByTestId("where")).toHaveTextContent(
        "/app/decisions/new-sample/ranking?tour=1",
      ),
    );
  });
});

describe("workspace tour", () => {
  it("walks the stage tabs in order, then the ranking, then AI help", () => {
    const targets = tours.workspace.map((s) => s.target);
    expect(targets.slice(0, 3)).toEqual(["tab-alternatives", "tab-criteria", "tab-scores"]);
    expect(targets.indexOf("leader")).toBeGreaterThan(targets.indexOf("tab-scores"));
    expect(targets.indexOf("tab-ai")).toBeGreaterThan(targets.indexOf("breakdown"));
    for (const step of tours.workspace.filter((s) => s.tone === "ai")) {
      expect(step.body).toMatch(/never change/);
    }
  });
});

describe("Guide start_tour action", () => {
  it("starts only registered tours; anything else from model output is ignored", async () => {
    render(
      <TourProvider>
        <p data-tour="drafter">drafter</p>
      </TourProvider>,
    );
    for (const bad of ["admin", "toString", "__proto__", 42, null, { id: "landing" }]) {
      expect(startTourAction(bad)).toBe(false);
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    expect(startTourAction("landing")).toBe(true);
    expect(await screen.findByRole("dialog", {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
