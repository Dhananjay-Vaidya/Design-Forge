import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { mockApi } from "./fixtures";

for (const scenario of [
  { name: "desktop-dark", width: 1440, theme: "dark" },
  { name: "desktop-light", width: 1440, theme: "light" },
  { name: "mobile-dark", width: 390, theme: "dark" },
] as const) {
  test(`decision builder: ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 });
    await page.addInitScript((theme) => localStorage.setItem("df-theme", theme), scenario.theme);
    await mockApi(page);
    await page.goto("/app/decisions/new");
    await expect(page.getByRole("heading", { name: "Frame the decision" })).toBeVisible();
    await page.getByLabel("What are you deciding?").fill("Which job offer should I accept?");
    await expect(page.getByRole("complementary", { name: "Decision preview" })).toContainText(
      "Which job offer should I accept?",
    );
    await page.getByRole("button", { name: "Career", exact: true }).click();
    await expect(page.getByLabel("Category", { exact: false })).toHaveValue("Career");
    await page.getByRole("button", { name: /Decide by/ }).click();
    await expect(page.getByRole("region", { name: "Choose a deadline" })).toBeVisible();
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () =>
      (
        await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    );
    expect(violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("calendar.png"), fullPage: true });
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByRole("region", { name: "Choose a deadline" })).toHaveCount(0);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Add an option").fill("Offer A");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByLabel("Add an option").fill("Offer B");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Choose your criteria" })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByLabel("What are you deciding?")).toHaveValue(
      "Which job offer should I accept?",
    );
    await expect(page.getByRole("button", { name: /Decide by/ })).not.toContainText(
      "Choose a date",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("details.png"), fullPage: true });
  });
}
