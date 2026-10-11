import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { dashboardQuotes } from "../src/content/dashboard";
import { decision, mockApi } from "./fixtures";

for (const scenario of [
  { name: "desktop-light", width: 1440, theme: "light" },
  { name: "tablet-dark", width: 1024, theme: "dark" },
  { name: "mobile-dark", width: 390, theme: "dark" },
] as const) {
  test(`marketing story and why page: ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 960 });
    await page.emulateMedia({ colorScheme: scenario.theme, reducedMotion: "reduce" });
    await page.addInitScript((theme) => localStorage.setItem("df-theme", theme), scenario.theme);
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Hard choices.Clear reasoning.",
    );
    await expect(
      page.getByText("Answers got cheap. Judgment got valuable.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("heading", { name: "Two kinds of output, never confused." })
      .scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "The ranking.", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The AI insight.", exact: true })).toBeVisible();
    await page.getByRole("heading", { name: "Questions, answered." }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Does it work offline?" }).click();
    await expect(page.getByText(/The saved decision workspace needs a connection/)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.locator("footer").getByRole("link", { name: "Why DecisionForge" }).click();
    await expect(page).toHaveURL(/\/why$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why DecisionForge");
    await expect(page).toHaveTitle("Why DecisionForge | DecisionForge AI");
    await expect(page.getByRole("heading", { name: "The method, not the mood." })).toBeVisible();
    await expect(page.locator("footer")).toContainText("Created by AI, Designed by Human.");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
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
    await page.screenshot({ path: testInfo.outputPath("why.png"), fullPage: true });
  });
}

test("dashboard counts reflect statuses and the quote stays stable while filtering", async ({
  page,
}) => {
  await mockApi(page);
  const results = ["DRAFT", "SCORED", "COMMITTED", "UNDER_REVIEW", "ARCHIVED"].map(
    (status, index) => ({
      ...decision,
      id: `status-${index}`,
      title: `${status} decision`,
      status,
    }),
  );
  await page.route("**/api/v1/decisions?*", (route) =>
    route.fulfill({ json: { count: results.length, page: 1, page_size: 100, results } }),
  );
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Your decisions", exact: true })).toBeVisible();
  for (const [label, count] of [
    ["Open", "2"],
    ["Drafting", "1"],
    ["Ready to rank", "1"],
    ["Committed", "2"],
    ["Review due", "1"],
  ]) {
    const tile = page
      .locator("dl > div")
      .filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) });
    await expect(tile.locator("dd")).toHaveText(count);
  }
  await expect(
    page.getByRole("link", { name: /UNDER_REVIEW decision Review outcome/ }),
  ).toHaveAttribute("href", "/app/decisions/status-3/commit");
  const quotes = page.getByText(
    new RegExp(dashboardQuotes.map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")),
  );
  await expect(quotes).toHaveCount(1);
  const original = await quotes.textContent();
  await page.getByRole("searchbox", { name: "Search decisions" }).fill("no matching decision");
  await expect(page.getByRole("heading", { name: "Nothing matches that." })).toBeVisible();
  await expect(quotes).toHaveText(original!);
  await expect(
    page.getByText("Answers got cheap. Judgment got valuable.", { exact: true }),
  ).toHaveCount(0);
});

test("dashboard keeps first-run and review-empty guidance practical", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/v1/decisions?*", (route) =>
    route.fulfill({ json: { count: 0, page: 1, page_size: 100, results: [] } }),
  );
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Frame your first decision." })).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "New decision", exact: true }),
  ).toHaveCount(2);
  await page.unroute("**/api/v1/decisions?*");
  await page.reload();
  await expect(page.getByText("Nothing to review yet.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View calibration" })).toHaveAttribute(
    "href",
    "/app/calibration",
  );
});
