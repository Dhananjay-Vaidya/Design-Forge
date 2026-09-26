import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DirectionToggle, WeightStepper } from "@/features/decisions/components/CriterionControls";

describe("DirectionToggle", () => {
  it("exposes both directions as radios and reports the choice", () => {
    const onChange = vi.fn();
    render(<DirectionToggle value="benefit" onChange={onChange} label="Salary direction" />);
    expect(screen.getByRole("radio", { name: "Higher is better" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Lower is better" }));
    expect(onChange).toHaveBeenCalledWith("cost");
  });
});

describe("WeightStepper", () => {
  it("steps by whole points, commits the new value, and never goes below 1", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const { rerender } = render(<WeightStepper label="Salary weight" value="2" onChange={onChange} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "Increase Salary weight" }));
    expect(onChange).toHaveBeenLastCalledWith("3");
    expect(onCommit).toHaveBeenLastCalledWith("3");

    rerender(<WeightStepper label="Salary weight" value="1" onChange={onChange} onCommit={onCommit} />);
    expect(screen.getByRole("button", { name: "Decrease Salary weight" })).toBeDisabled();
  });
});
