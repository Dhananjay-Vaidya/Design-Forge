import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useThemeStore } from "@/stores/themeStore";
import { DirectionToggle } from "@/features/decisions/components/CriterionControls";
import { entrance } from "@/lib/motion";
import { EffectsLifecycle } from "@/components/fx/EffectsLifecycle";

describe("UI effects accessibility", () => {
  it("persists a theme toggle and updates the root theme", () => {
    render(<ThemeToggle />);
    const initial = useThemeStore.getState().theme;
    fireEvent.click(screen.getByRole("button"));
    const next = initial === "dark" ? "light" : "dark";
    expect(localStorage.getItem("df-theme")).toBe(next);
    expect(document.documentElement.classList.contains("dark")).toBe(next === "dark");
    expect(screen.getByRole("button")).toHaveAccessibleName(`Switch to ${initial} mode`);
    fireEvent.click(screen.getByRole("button"));
  });

  it("uses roving focus and arrow selection for criterion directions", () => {
    const change = vi.fn();
    render(<DirectionToggle value="benefit" onChange={change} />);
    const first = screen.getByRole("radio", { name: "Higher is better" });
    const second = screen.getByRole("radio", { name: "Lower is better" });
    expect(second).toHaveAttribute("tabindex", "-1");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(change).toHaveBeenCalledWith("cost");
    expect(second).toHaveFocus();
  });

  it("removes displacement and hidden initial content for reduced motion", () => {
    expect(entrance(true).initial).toEqual({ opacity: 1, y: 0 });
    expect(entrance(true).exit.y).toBe(0);
  });

  it("pauses ambient CSS when the document is hidden and cleans up", () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const { unmount } = render(<EffectsLifecycle />);
    expect(document.documentElement).toHaveAttribute("data-effects-paused");
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    expect(document.documentElement).not.toHaveAttribute("data-effects-paused");
    unmount();
    hidden.mockRestore();
  });
});
