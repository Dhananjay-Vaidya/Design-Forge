import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CoverflowCarousel } from "@/components/effects/CoverflowCarousel";
import { Magnetic } from "@/components/effects/Magnetic";
import { Tilt } from "@/components/effects/Tilt";

function stubFineMotion(fine: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: fine,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** jsdom has no PointerEvent, so fireEvent.pointerMove carries no pointerType; build one that does. */
function pointerMove(el: Element, pointerType: string, clientX: number, clientY: number) {
  const event = new MouseEvent("pointermove", { bubbles: true, clientX, clientY });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(el, event);
}

afterEach(() => {
  // @ts-expect-error jsdom has no matchMedia; remove the stub again
  delete window.matchMedia;
});

const ITEMS = [
  { id: "a", name: "Job offer" },
  { id: "b", name: "Rent vs buy" },
  { id: "c", name: "Vendor choice" },
];

function Carousel() {
  return (
    <CoverflowCarousel
      items={ITEMS}
      getKey={(t) => t.id}
      getLabel={(t) => t.name}
      label="Built-in templates"
      itemNoun="template"
      renderItem={(t) => <button type="button">Use {t.name}</button>}
    />
  );
}

describe("Tilt", () => {
  it("is a plain wrapper on touch, small screens and reduced motion", () => {
    stubFineMotion(false);
    render(
      <Tilt className="h-full" data-testid="tilt">
        <p>card</p>
      </Tilt>,
    );
    const el = screen.getByTestId("tilt");
    expect(el.getAttribute("style")).toBeNull();
    expect(el).toHaveClass("h-full");
  });

  it("tilts toward a mouse, ignores touch, and settles back on leave", async () => {
    stubFineMotion(true);
    render(
      <Tilt data-testid="tilt" max={3}>
        <p>card</p>
      </Tilt>,
    );
    const el = screen.getByTestId("tilt");
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
    pointerMove(el, "touch", 200, 0);
    expect(el.style.transform).not.toMatch(/rotateY\((?!0)/);
    pointerMove(el, "mouse", 200, 0);
    await waitFor(() => expect(el.style.transform).toMatch(/rotateY\([1-9]/));
    fireEvent.pointerLeave(el);
    await waitFor(() => expect(el.style.transform).not.toMatch(/rotateY\([1-9]/), {
      timeout: 3000,
    });
  });

  it("never goes past its maximum angle, even with a pointer far outside a stale rect", async () => {
    stubFineMotion(true);
    render(
      <Tilt data-testid="tilt" max={3}>
        <p>card</p>
      </Tilt>,
    );
    const el = screen.getByTestId("tilt");
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
    pointerMove(el, "mouse", 10_000, -10_000);
    await new Promise((r) => setTimeout(r, 900));
    const rotY = Math.abs(Number(/rotateY\(([-\d.]+)deg\)/.exec(el.style.transform)?.[1] ?? 0));
    const rotX = Math.abs(Number(/rotateX\(([-\d.]+)deg\)/.exec(el.style.transform)?.[1] ?? 0));
    expect(rotY).toBeLessThanOrEqual(3.01);
    expect(rotX).toBeLessThanOrEqual(3.01);
    expect(rotY).toBeGreaterThan(2);
  });
});

describe("Magnetic", () => {
  it("is static without a fine pointer and motion", () => {
    stubFineMotion(false);
    const { container } = render(
      <Magnetic>
        <a href="/register">Start deciding</a>
      </Magnetic>,
    );
    expect((container.firstChild as HTMLElement).getAttribute("style")).toBeNull();
  });

  it("pulls a few pixels at most, and keyboard activation is unaffected", async () => {
    stubFineMotion(true);
    const onClick = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const { container } = render(
      <Magnetic max={4}>
        <a href="/register" onClick={onClick}>
          Start deciding
        </a>
      </Magnetic>,
    );
    const wrap = container.firstChild as HTMLElement;
    wrap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 40 }) as DOMRect;
    pointerMove(wrap, "mouse", 1000, 20);
    await new Promise((r) => setTimeout(r, 600));
    const px = Number(/translateX\(([-\d.]+)px\)/.exec(wrap.style.transform)?.[1] ?? 0);
    const py = Number(/translateY\(([-\d.]+)px\)/.exec(wrap.style.transform)?.[1] ?? 0);
    expect(px).toBeGreaterThan(0);
    expect(Math.hypot(px, py)).toBeLessThanOrEqual(4.01); // the distance is capped, even diagonally

    const link = screen.getByRole("link", { name: "Start deciding" });
    link.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("CoverflowCarousel", () => {
  it("is a plain swipeable list on touch and reduced motion, with every slide reachable", () => {
    stubFineMotion(false);
    render(<Carousel />);
    const region = screen.getByRole("region", { name: "Built-in templates" });
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
    const slides = within(region).getAllByRole("group");
    expect(slides).toHaveLength(3);
    expect(slides[1]).toHaveAttribute("aria-label", "2 of 3: Rent vs buy");
    expect(screen.getAllByRole("button", { name: /Use / })).toHaveLength(3); // all tappable
    expect(screen.getByRole("button", { name: "Next template" })).toBeInTheDocument();
  });

  it("moves with the arrow keys, announces the slide, and keeps only the centred slide interactive", async () => {
    stubFineMotion(true);
    render(<Carousel />);
    const region = screen.getByRole("region", { name: "Built-in templates" });
    // Hidden slides have no accessible name by design, so find them by their label attribute.
    const slide = (name: string) =>
      region.querySelector<HTMLElement>(`[aria-roledescription="slide"][aria-label$="${name}"]`)!;
    expect(slide("Job offer").inert).toBe(false);
    expect(slide("Rent vs buy").inert).toBe(true);
    // Off-centre slides are hidden from assistive tech as well as from focus and clicks.
    expect(slide("Rent vs buy")).toHaveAttribute("aria-hidden", "true");
    expect(slide("Job offer")).not.toHaveAttribute("aria-hidden");
    expect(within(region).getAllByRole("button", { name: /^Use / })).toHaveLength(1);
    expect(screen.getByText("Template 1 of 3: Job offer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous template" })).toBeDisabled();

    region.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Template 2 of 3: Rent vs buy")).toBeInTheDocument();
    expect(slide("Rent vs buy").inert).toBe(false);
    expect(slide("Job offer").inert).toBe(true);

    await userEvent.keyboard("{ArrowRight}{ArrowRight}"); // stops at the end, no wrap-around
    expect(screen.getByText("Template 3 of 3: Vendor choice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next template" })).toBeDisabled();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("Template 2 of 3: Rent vs buy")).toBeInTheDocument();
  });

  it("jumps straight to a slide from its dot", async () => {
    stubFineMotion(true);
    render(<Carousel />);
    await userEvent.click(
      screen.getByRole("button", { name: "Go to template 3 of 3: Vendor choice" }),
    );
    expect(
      screen.getByRole("button", { name: "Go to template 3 of 3: Vendor choice" }),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Template 3 of 3: Vendor choice")).toBeInTheDocument();
  });

  it("renders nothing for an empty list", () => {
    stubFineMotion(true);
    const { container } = render(
      <CoverflowCarousel
        items={[]}
        getKey={String}
        getLabel={String}
        renderItem={String}
        label="x"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
