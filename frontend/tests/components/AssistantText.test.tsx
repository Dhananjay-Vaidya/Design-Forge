import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssistantText } from "@/features/ai/AssistantText";

describe("AssistantText", () => {
  it("renders bullet lines as a list and **bold** as strong text", () => {
    render(<AssistantText text={"Top risks:\n\n- **Commute** is long\n- Growth is uncertain"} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Commute").tagName).toBe("STRONG");
  });

  it("turns bullets that directly follow an intro line into a list", () => {
    render(<AssistantText text={"Next steps:\n- Confirm salary\n- Check commute policy"} />);
    expect(screen.getByText("Next steps:").tagName).toBe("P");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Confirm salary",
      "Check commute policy",
    ]);
  });

  it("never interprets model output as HTML", () => {
    const { container } = render(
      <AssistantText text={'<img src=x onerror="alert(1)"> <b>hi</b>'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
  });
});
