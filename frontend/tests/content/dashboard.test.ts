import { describe, expect, it } from "vitest";
import { dashboardGreeting } from "@/content/dashboard";

describe("dashboard greeting", () => {
  it.each([
    [0, "Good morning, Mira. What are you deciding today?"],
    [11, "Good morning, Mira. What are you deciding today?"],
    [12, "Good afternoon, Mira. Pick up where you left off."],
    [17, "Good afternoon, Mira. Pick up where you left off."],
    [18, "Evening, Mira. One clear decision beats ten open tabs."],
    [23, "Evening, Mira. One clear decision beats ten open tabs."],
  ])("uses the right greeting at hour %i", (hour, expected) => {
    expect(dashboardGreeting("Mira", hour)).toBe(expected);
  });

  it("omits the name cleanly when a profile is unavailable", () => {
    expect(dashboardGreeting(undefined, 12)).toBe("Good afternoon. Pick up where you left off.");
  });
});
