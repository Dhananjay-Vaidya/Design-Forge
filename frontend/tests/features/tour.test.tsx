import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TourProvider, hasSeenTour, startTour, useTour } from "@/features/tour";
import type { TourId, TourStep } from "@/features/tour";

const TOURS: Record<TourId, TourStep[]> = {
  landing: [
    { target: "one", title: "First stop", body: "About the first thing.", tone: "calc" },
    { target: "missing", title: "Never shown", body: "This target is not mounted.", tone: "calc" },
    { target: "two", title: "Second stop", body: "AI advises, never scores.", tone: "ai" },
  ],
  workspace: [{ target: "nowhere", title: "Nothing here", body: "Not mounted.", tone: "calc" }],
};

function Page() {
  const { startTour: launch } = useTour();
  return (
    <>
      <button type="button" onClick={() => launch("landing")}>
        Start tour
      </button>
      <button type="button" onClick={() => launch("workspace")}>
        Start empty tour
      </button>
      <div data-tour="one">One</div>
      <div data-tour="other two">Two</div>
    </>
  );
}

function renderTour() {
  return render(
    <TourProvider tours={TOURS} findTimeout={60}>
      <Page />
    </TourProvider>,
  );
}

async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Start tour" }));
  // Generous timeout: the overlay is a lazy chunk, and the first import is slow under the test runner.
  return screen.findByRole("dialog", {}, { timeout: 5000 });
}

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

describe("tour engine", () => {
  it("opens as a labelled modal dialog, moves focus into it and locks body scroll", async () => {
    renderTour();
    expect(screen.queryByRole("dialog")).toBeNull();
    const dialog = await open();
    await waitFor(() => expect(dialog).toHaveAccessibleName("First stop"));
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("About the first thing.");
    expect(dialog).toHaveFocus();
    expect(dialog.querySelector("[aria-live=polite]")).toHaveTextContent("Step 1 of 3");
    expect(screen.getByRole("button", { name: /Back/ })).toBeDisabled();
    expect(document.documentElement.style.overflow).toBe("hidden");
    // A calculated step: teal ring, and it glides into place.
    const ring = document.querySelector("[data-tour-ring]");
    expect(ring).toHaveAttribute("data-tone", "calc");
    expect(ring).toHaveAttribute("data-motion", "glide");
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("skips a step whose target is missing, both forwards and back", async () => {
    renderTour();
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    // "missing" is never mounted: the engine moves on to the next real stop.
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog).toHaveAccessibleName("Second stop"));
    expect(screen.queryByText("Never shown")).toBeNull();
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    // An AI step: violet ring and label. The target is matched within a space-separated list.
    expect(document.querySelector("[data-tour-ring]")).toHaveAttribute("data-tone", "ai");
    expect(screen.getByText("AI · advisory")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    await waitFor(() => expect(dialog).toHaveAccessibleName("First stop"));
  });

  it("is fully keyboard operable: Enter and → advance, ← goes back, Esc closes", async () => {
    renderTour();
    const dialog = await open();
    await waitFor(() => expect(dialog).toHaveAccessibleName("First stop"));
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(dialog).toHaveAccessibleName("Second stop"));
    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(() => expect(dialog).toHaveAccessibleName("First stop"));
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(dialog).toHaveAccessibleName("Second stop"));

    // Enter on a focused control activates that control rather than advancing.
    screen.getByRole("button", { name: /Back/ }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(dialog).toHaveAccessibleName("First stop"));
    // Back is now disabled; focus stays inside the card instead of falling to the page.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    // Tab cycles inside the card.
    for (let i = 0; i < 5; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("returns focus to the trigger, restores scrolling and marks the tour seen on close", async () => {
    renderTour();
    expect(hasSeenTour("landing")).toBe(false);
    const dialog = await open();
    await waitFor(() => expect(dialog).toHaveAccessibleName("First stop"));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    await waitFor(() => expect(dialog).toHaveAccessibleName("Second stop"));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Start tour" })).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.documentElement).not.toHaveAttribute("data-tour-active");
    expect(hasSeenTour("landing")).toBe(true);
  });

  it("Skip closes without finishing, and returns focus too", async () => {
    renderTour();
    const dialog = await open();
    await waitFor(() => expect(dialog).toHaveAccessibleName("First stop"));
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Start tour" })).toHaveFocus();
  });

  it("ends quietly when no step has a target on this screen", async () => {
    renderTour();
    await userEvent.click(screen.getByRole("button", { name: "Start empty tour" }));
    await waitFor(() => expect(screen.queryByTestId("tour-overlay")).toBeNull());
    expect(screen.queryByText("Nothing here")).toBeNull();
    expect(screen.getByRole("button", { name: "Start empty tour" })).toHaveFocus();
  });

  it("can be started imperatively, e.g. by the Guide's start_tour action", async () => {
    renderTour();
    expect(startTour("landing")).toBe(true);
    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
    await waitFor(() => expect(dialog).toHaveAccessibleName("First stop"));
    act(() => {
      startTour("landing"); // restarting while open is harmless
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("reports no provider rather than throwing", () => {
    expect(startTour("landing")).toBe(false);
  });
});
