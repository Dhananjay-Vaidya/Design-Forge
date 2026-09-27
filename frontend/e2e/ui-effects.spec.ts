import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { mockApi } from "./fixtures";

const routes = [
  "/",
  "/login",
  "/register",
  "/app",
  "/app/decisions/new",
  "/app/decisions/demo/alternatives",
  "/app/decisions/demo/criteria",
  "/app/decisions/demo/scores",
  "/app/decisions/demo/ranking",
  "/missing",
];

for (const scenario of [
  { name: "desktop-light", width: 1440, theme: "light" },
  { name: "desktop-dark", width: 1440, theme: "dark" },
  { name: "mobile-light", width: 375, theme: "light" },
] as const) {
  test(`${scenario.name}: routes, screenshots and WCAG checks`, async ({ page }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.emulateMedia({ colorScheme: scenario.theme, reducedMotion: "reduce" });
    await page.addInitScript((theme) => localStorage.setItem("df-theme", theme), scenario.theme);
    await mockApi(page);
    for (const [index, route] of routes.entries()) {
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (route.endsWith("ranking"))
        await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
          })
        ).violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
        })),
      );
      expect(violations, route).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`${index}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
    expect(runtimeErrors).toEqual([]);
  });
}

test("responsive layouts at remaining required widths", async ({ page }) => {
  await mockApi(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect
        .poll(
          () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          { message: `${route} at ${width}` },
        )
        .toBe(true);
    }
  }
});

test("navigation and modal keyboard focus, theme persistence, scoring arrows", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Laboratory navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: /Switch to .* mode/ }).click();
  const dark = await page.locator("html").getAttribute("class");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("class", dark ?? "");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/decisions/demo/scores");
  const cells = page.locator("table input[data-cell]");
  await cells.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(cells.nth(1)).toBeFocused();
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Ask AI Advisory" })).toBeVisible();
  await page.getByRole("button", { name: "Close Ask AI" }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Ask AI", exact: true })).toBeFocused();
});

for (const state of ["enabled", "disabled", "error", "quota"] as const) {
  test(`AI ${state} state`, async ({ page }, testInfo) => {
    await mockApi(page, state);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app/decisions/demo/ranking");
    await page.getByRole("button", { name: "Ask AI", exact: true }).click();
    if (state === "disabled")
      await expect(page.getByText("The AI assistant is turned off")).toBeVisible();
    if (state === "error")
      await expect(page.getByText("Assistant status unavailable")).toBeVisible();
    if (state === "quota")
      await expect(page.getByText("Daily advisory limit reached")).toBeVisible();
    if (state === "enabled") {
      await page.getByRole("textbox", { name: "Your question" }).fill("What should I review?");
      await page.getByRole("button", { name: "Send question" }).click();
      await expect(page.getByText("Review cost assumptions before committing.")).toBeVisible();
    }
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () =>
      (
        await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
        })
      ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    );
    expect(violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`ai-${state}.png`), animations: "disabled" });
  });
}

test("mobile stage selector and confirmation dialog preserve navigation and focus", async ({
  page,
}) => {
  await mockApi(page);
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/app/decisions/demo/alternatives");
  await page.getByRole("combobox", { name: /^Decision stage/ }).selectOption("ranking");
  await expect(page).toHaveURL(/\/ranking$/);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this decision?" });
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
});

test("reduced-motion ranking renders final values and theme can change live", async ({ page }) => {
  await mockApi(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/decisions/demo/ranking");
  await expect(page.getByLabel("78.0", { exact: true })).toHaveText("78.0");
  expect(await page.locator(".skeleton").count()).toBe(0);
  const before = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundColor);
  await page.getByRole("button", { name: /Switch to .* mode/ }).click();
  await expect
    .poll(() => page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor))
    .not.toBe(before);
});

test("command palette traps focus and returns it on escape", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  const trigger = page.getByRole("button", { name: "Open command palette (Ctrl+K)" });
  await trigger.click();
  const input = page.getByRole("combobox", { name: "Search decisions and commands" });
  await expect(input).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
