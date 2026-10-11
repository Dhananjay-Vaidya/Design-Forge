import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/features/landing/draftApi";
import { TourProvider, tours } from "@/features/tour";
import { LandingPage } from "@/pages/LandingPage";

vi.mock("@/features/landing/draftApi");

beforeAll(() => {
  // jsdom has no IntersectionObserver (reveal-on-scroll); a no-op one is enough here.
  window.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.mocked(api.getGuideStatus).mockResolvedValue({
    enabled: true,
    free_drafts_per_day: 2,
    drafts_remaining: 2,
  });
});

function renderLanding() {
  render(
    <TourProvider>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </TourProvider>,
  );
}

describe("landing live-demo tour", () => {
  it("anchors every step on a real landing section", () => {
    renderLanding();
    for (const step of tours.landing) {
      expect(document.querySelectorAll(`[data-tour~="${step.target}"]`), step.target).toHaveLength(
        1,
      );
    }
  });

  it("is opt-in: nothing opens on page load", async () => {
    renderLanding();
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("“Try the live demo” runs the six steps with teal/violet tones, then returns focus", async () => {
    renderLanding();
    const trigger = screen.getByRole("link", { name: "Try the live demo" });
    expect(trigger).toHaveAttribute("href", "#demo"); // still works without JS
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });

    const expected = [
      ["Describe it", "ai"],
      ["Score & rank", "calc"],
      ["See the why", "calc"],
      ["Stress-test it", "calc"],
      ["AI that advises", "ai"],
      ["Start from a template", "calc"],
    ] as const;
    for (const [i, [title, tone]] of expected.entries()) {
      await waitFor(() => expect(dialog).toHaveAccessibleName(title));
      expect(screen.getByText(`Step ${i + 1} of 6`)).toBeInTheDocument();
      expect(document.querySelector("[data-tour-ring]")).toHaveAttribute("data-tone", tone);
      if (i < expected.length - 1) await userEvent.keyboard("{ArrowRight}");
    }
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(localStorage.getItem("df-tour-seen:landing")).toBe("1");
  });

  it("keeps the AI framing: AI steps say AI never sets the scores or numbers", () => {
    const ai = tours.landing.filter((s) => s.tone === "ai");
    expect(ai.map((s) => s.target)).toEqual(["drafter", "ai-advisory"]);
    for (const step of ai) expect(step.body).toMatch(/never (sets the scores|touch the numbers)/);
  });
});
