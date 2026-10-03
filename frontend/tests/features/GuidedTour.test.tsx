import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GuidedTour, type TourStep } from "@/features/tour/GuidedTour";

const steps: TourStep[] = [
  { target: '[data-tour="one"]', title: "First stop", body: "About the first thing." },
  { target: '[data-tour="two"]', title: "Second stop", body: "About the second thing." },
  { target: '[data-tour="missing"]', title: "Third stop", body: "Target never renders." },
];

function Page({ onClose, open = true }: { onClose: (done: boolean) => void; open?: boolean }) {
  return (
    <>
      <button data-tour="one">One</button>
      <button data-tour="two">Two</button>
      <GuidedTour steps={steps} open={open} onClose={onClose} />
    </>
  );
}

describe("GuidedTour", () => {
  it("renders nothing while closed", () => {
    render(<Page onClose={() => {}} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens as a labelled dialog on step one and moves focus to its heading", async () => {
    render(<Page onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("First stop");
    expect(dialog).toHaveAccessibleDescription("About the first thing.");
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "First stop" })).toHaveFocus();
    expect(screen.getByRole("button", { name: /Back/ })).toBeDisabled();
  });

  it("steps forward and back with the buttons and the arrow keys", async () => {
    render(<Page onClose={() => {}} />);
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(await screen.findByRole("heading", { name: "Second stop" })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(await screen.findByRole("heading", { name: "Third stop" })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(await screen.findByRole("heading", { name: "Second stop" })).toBeInTheDocument();
  });

  it("finishes with Done (completed) and skips with Escape (not completed)", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<Page onClose={onClose} />);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenLastCalledWith(false);
    unmount();

    onClose.mockClear();
    render(<Page onClose={onClose} />);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await screen.findByRole("heading", { name: "Third stop" });
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenLastCalledWith(true);
  });

  it("returns focus to the element that had it before the tour opened", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Page onClose={onClose} open={false} />);
    screen.getByRole("button", { name: "One" }).focus();
    rerender(<Page onClose={onClose} open />);
    await screen.findByRole("dialog");
    rerender(<Page onClose={onClose} open={false} />);
    expect(screen.getByRole("button", { name: "One" })).toHaveFocus();
  });
});
