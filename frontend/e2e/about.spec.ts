import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { mockApi } from "./fixtures";

for (const scenario of [
  { name: "desktop-light", width: 1440, theme: "light" },
  { name: "tablet-dark", width: 1024, theme: "dark" },
  { name: "mobile-light", width: 390, theme: "light" },
  { name: "mobile-dark", width: 360, theme: "dark" },
] as const) {
  test(`About, navigation and privacy: ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 960 });
    await page.emulateMedia({ colorScheme: scenario.theme, reducedMotion: "reduce" });
    await page.addInitScript((theme) => localStorage.setItem("df-theme", theme), scenario.theme);
    await mockApi(page);
    await page.goto("/");
    await page.locator("footer").getByRole("link", { name: "About", exact: true }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page).toHaveTitle("About | DecisionForge AI");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "The method behind better decisions.",
    );
    for (const title of [
      "Why build another decision tool?",
      "AI advises. You decide.",
      "One person. A considered product.",
      "Depth before more features.",
      "A few principles, made practical.",
      "Let's talk.",
    ]) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    await expect(page.getByText(/DecisionForge is a solo project/)).toBeVisible();
    await expect(page.getByText("dhananjayvaidya4154@gmail.com", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
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
    await page.screenshot({ path: testInfo.outputPath("about.png"), fullPage: true });
    await page.locator("footer").getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("How your data is used.");
    await expect(page.getByText(/There is no automatic expiry/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
