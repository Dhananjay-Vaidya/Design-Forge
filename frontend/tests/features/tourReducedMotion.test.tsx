import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { TourProvider, useTour } from "@/features/tour";
import type { TourId, TourStep } from "@/features/tour";

// Its own file: motion reads prefers-reduced-motion once per module, so it must be stubbed first.
beforeAll(() => {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes("prefers-reduced-motion") && !query.includes("no-preference"),
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

const TOURS: Record<TourId, TourStep[]> = {
  landing: [
    { target: "a", title: "First", body: "One.", tone: "calc" },
    { target: "b", title: "Second", body: "Two.", tone: "ai" },
  ],
  workspace: [],
};

function Page() {
  const { startTour } = useTour();
  return (
    <>
      <button type="button" onClick={() => startTour("landing")}>
        Start
      </button>
      <p data-tour="a">A</p>
      <p data-tour="b">B</p>
    </>
  );
}

describe("tour under reduced motion", () => {
  it("jumps between steps: instant scrolling and no ring glide, but still steps through", async () => {
    render(
      <TourProvider tours={TOURS}>
        <Page />
      </TourProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
    await waitFor(() => expect(dialog).toHaveAccessibleName("First"));
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "instant" }));
    expect(window.scrollTo).not.toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    expect(document.querySelector("[data-tour-ring]")).toHaveAttribute("data-motion", "instant");

    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(dialog).toHaveAccessibleName("Second"));
    expect(document.querySelector("[data-tour-ring]")).toHaveAttribute("data-motion", "instant");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
